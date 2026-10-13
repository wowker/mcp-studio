package platform

import (
	"context"
	"crypto/subtle"
	"errors"
	"github.com/jackc/pgx/v5"
	"mcp-studio/internal/wire"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

func (a *App) memberRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/projects/{projectId}/members", a.listProjectMembers)
	mux.HandleFunc("PATCH /api/v1/projects/{projectId}/members/{userId}", a.changeProjectMember)
	mux.HandleFunc("DELETE /api/v1/projects/{projectId}/members/{userId}", a.changeProjectMember)
	mux.HandleFunc("GET /api/v1/teams/{teamId}/members", a.listTeamMembers)
	mux.HandleFunc("PATCH /api/v1/teams/{teamId}/members/{userId}", a.changeTeamMember)
	mux.HandleFunc("DELETE /api/v1/teams/{teamId}/members/{userId}", a.changeTeamMember)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/invitations", a.listInvitations)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/invitations", a.createInvitation)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/invitations/{id}/revoke", a.revokeInvitation)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/invitations/{id}/resend", a.resendInvitation)
	mux.HandleFunc("GET /api/v1/invitations/{id}", a.invitationEntry)
	mux.HandleFunc("POST /api/v1/invitations/{id}/accept", a.acceptInvitation)
}

// All role changes, invitations and accepts lock the same team row before
// authority and last-maintainer checks, including multi-project team removal.
func (a *App) projectWrite(w http.ResponseWriter, r *http.Request, u wire.User) (pgx.Tx, projectAccess, bool) {
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		dbFailure(w, err)
		return nil, projectAccess{}, false
	}
	scope, err := projectScope(ctx, tx, r.PathValue("projectId"), u.ID)
	if err != nil {
		tx.Rollback(ctx)
		fail(w, 404, "not_found")
		return nil, scope, false
	}
	if err = lockTeamTx(ctx, tx, scope.teamID); err != nil {
		tx.Rollback(ctx)
		dbFailure(w, err)
		return nil, scope, false
	}
	scope, err = projectScope(ctx, tx, r.PathValue("projectId"), u.ID)
	if err != nil || !scope.canManage() {
		tx.Rollback(ctx)
		fail(w, 403, "forbidden")
		return nil, scope, false
	}
	return tx, scope, true
}
func validProjectRole(role string) bool {
	return role == "maintainer" || role == "developer" || role == "viewer"
}
func (a *App) listProjectMembers(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	pid := r.PathValue("projectId")
	scope, err := projectScope(r.Context(), a.DB, pid, u.ID)
	if err != nil {
		fail(w, 404, "not_found")
		return
	}
	if !scope.canRead() && !scope.canManage() {
		fail(w, 403, "forbidden")
		return
	}
	rows, err := a.DB.Query(r.Context(), `SELECT u.id,u.email,u.name,tm.role,pm.role FROM project_members pm JOIN users u ON u.id=pm.user_id JOIN projects p ON p.id=pm.project_id JOIN team_members tm ON tm.team_id=p.team_id AND tm.user_id=u.id WHERE pm.project_id=$1 ORDER BY lower(u.name),u.id`, pid)
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer rows.Close()
	members := []wire.Member{}
	for rows.Next() {
		var member wire.Member
		if err = rows.Scan(&member.ID, &member.Email, &member.Name, &member.TeamRole, &member.ProjectRole); err != nil {
			dbFailure(w, err)
			return
		}
		members = append(members, member)
	}
	if rows.Err() != nil {
		dbFailure(w, rows.Err())
		return
	}
	success(w, members)
}
func (a *App) listTeamMembers(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	teamID := r.PathValue("teamId")
	var role string
	if err := a.DB.QueryRow(r.Context(), `SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2`, teamID, u.ID).Scan(&role); err != nil {
		fail(w, 403, "forbidden")
		return
	}
	rows, err := a.DB.Query(r.Context(), `SELECT u.id,u.email,u.name,tm.role FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=$1 ORDER BY lower(u.name),u.id`, teamID)
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer rows.Close()
	members := []wire.Member{}
	for rows.Next() {
		var member wire.Member
		if err = rows.Scan(&member.ID, &member.Email, &member.Name, &member.TeamRole); err != nil {
			dbFailure(w, err)
			return
		}
		members = append(members, member)
	}
	if rows.Err() != nil {
		dbFailure(w, rows.Err())
		return
	}
	success(w, members)
}
func (a *App) changeProjectMember(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	var req wire.MemberRequest
	if r.Method == "PATCH" {
		if !decode(w, r, &req) {
			return
		}
		if !validProjectRole(string(req.Role)) {
			fail(w, 400, "invalid_role")
			return
		}
	}
	tx, scope, ok := a.projectWrite(w, r, u)
	if !ok {
		return
	}
	ctx := r.Context()
	defer tx.Rollback(ctx)
	pid, target := r.PathValue("projectId"), r.PathValue("userId")
	var teamRole string
	if err := tx.QueryRow(ctx, `SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2`, scope.teamID, target).Scan(&teamRole); err != nil {
		fail(w, 404, "not_found")
		return
	}
	if target == u.ID || teamRole == "owner" || (scope.teamRole == "admin" && teamRole == "admin") {
		fail(w, 403, "protected_member")
		return
	}
	var previous string
	err := tx.QueryRow(ctx, `SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2`, pid, target).Scan(&previous)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		dbFailure(w, err)
		return
	}
	if r.Method == "DELETE" && errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404, "not_found")
		return
	}
	if previous == "maintainer" && (r.Method == "DELETE" || req.Role != "maintainer") {
		var count int
		if err = tx.QueryRow(ctx, `SELECT count(*) FROM project_members WHERE project_id=$1 AND role='maintainer'`, pid).Scan(&count); err != nil {
			dbFailure(w, err)
			return
		}
		if count <= 1 {
			fail(w, 409, "last_maintainer")
			return
		}
	}
	if r.Method == "DELETE" {
		err = a.archivePrivateRecords(ctx, tx, pid, target)
	} else {
		err = a.restorePrivateRecords(ctx, tx, pid, target)
	}
	if err != nil {
		dbFailure(w, err)
		return
	}
	action := "project.member.changed"
	if r.Method == "DELETE" {
		_, err = tx.Exec(ctx, `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, pid, target)
		action = "project.member.removed"
	} else {
		_, err = tx.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,$3) ON CONFLICT(project_id,user_id) DO UPDATE SET role=EXCLUDED.role`, pid, target, req.Role)
	}
	if err != nil {
		dbFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, action, target, ""); err != nil {
		dbFailure(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		dbFailure(w, err)
		return
	}
	success(w, wire.Accepted{Ok: true})
}
func (a *App) changeTeamMember(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	var req wire.TeamMemberRequest
	if r.Method == "PATCH" {
		if !decode(w, r, &req) {
			return
		}
		if req.Role != "admin" && req.Role != "member" {
			fail(w, 403, "owner_transfer_out_of_scope")
			return
		}
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer tx.Rollback(ctx)
	teamID, target := r.PathValue("teamId"), r.PathValue("userId")
	if err = lockTeamTx(ctx, tx, teamID); err != nil {
		fail(w, 403, "forbidden")
		return
	}
	var actorRole, targetRole, email string
	err = tx.QueryRow(ctx, `SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2`, teamID, u.ID).Scan(&actorRole)
	if err != nil || (actorRole != "owner" && actorRole != "admin") {
		fail(w, 403, "forbidden")
		return
	}
	err = tx.QueryRow(ctx, `SELECT tm.role,u.email FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=$1 AND tm.user_id=$2`, teamID, target).Scan(&targetRole, &email)
	if err != nil {
		fail(w, 404, "not_found")
		return
	}
	if target == u.ID || targetRole == "owner" || (actorRole == "admin" && (targetRole == "admin" || req.Role == "admin")) {
		fail(w, 403, "protected_member")
		return
	}
	if r.Method == "DELETE" {
		var protected bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE p.team_id=$1 AND pm.user_id=$2 AND pm.role='maintainer' AND (SELECT count(*) FROM project_members m WHERE m.project_id=pm.project_id AND m.role='maintainer')<=1)`, teamID, target).Scan(&protected)
		if err != nil {
			dbFailure(w, err)
			return
		}
		if protected {
			fail(w, 409, "last_maintainer")
			return
		}
		if _, err = tx.Exec(ctx, `UPDATE records SET archived_at=$3 WHERE owner_id=$1 AND visibility='private' AND archived_at IS NULL AND project_id IN(SELECT id FROM projects WHERE team_id=$2)`, target, teamID, a.Now()); err != nil {
			dbFailure(w, err)
			return
		}
		if _, err = tx.Exec(ctx, `DELETE FROM project_members WHERE user_id=$1 AND project_id IN(SELECT id FROM projects WHERE team_id=$2)`, target, teamID); err != nil {
			dbFailure(w, err)
			return
		}
		if _, err = tx.Exec(ctx, `UPDATE invitations SET status='revoked' WHERE email=$1 AND status='pending' AND project_id IN(SELECT id FROM projects WHERE team_id=$2)`, email, teamID); err != nil {
			dbFailure(w, err)
			return
		}
		_, err = tx.Exec(ctx, `DELETE FROM team_members WHERE team_id=$1 AND user_id=$2`, teamID, target)
	} else {
		_, err = tx.Exec(ctx, `UPDATE team_members SET role=$3 WHERE team_id=$1 AND user_id=$2`, teamID, target, req.Role)
	}
	if err != nil {
		dbFailure(w, err)
		return
	}
	action := "team.member.changed"
	if r.Method == "DELETE" {
		action = "team.member.removed"
	}
	if err = audit(ctx, tx, teamID, "", u.ID, action, target, ""); err != nil {
		dbFailure(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		dbFailure(w, err)
		return
	}
	success(w, wire.Accepted{Ok: true})
}

type invitationMeta struct {
	entry                                                   wire.Invitation
	teamID, createdBy, acceptedBy, tokenDigest, projectName string
	expires                                                 time.Time
}

func readInvitation(ctx context.Context, q queryRower, inviteID string) (invitationMeta, error) {
	var v invitationMeta
	err := q.QueryRow(ctx, `SELECT i.id,i.project_id,i.email,i.team_role,i.project_role,i.status,i.expires_at,i.delivery,i.created_by,COALESCE(i.accepted_by,''),i.digest,p.team_id,p.name FROM invitations i JOIN projects p ON p.id=i.project_id WHERE i.id=$1`, inviteID).Scan(&v.entry.ID, &v.entry.ProjectID, &v.entry.Email, &v.entry.TeamRole, &v.entry.ProjectRole, &v.entry.Status, &v.expires, &v.entry.Delivery, &v.createdBy, &v.acceptedBy, &v.tokenDigest, &v.teamID, &v.projectName)
	v.entry.ExpiresAt = v.expires.UTC().Format(time.RFC3339)
	return v, err
}
func (a *App) invitationStatus(v invitationMeta) string {
	if v.entry.Status == "pending" && !a.Now().Before(v.expires) {
		return "expired"
	}
	return v.entry.Status
}
func (a *App) listInvitations(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	scope, err := projectScope(r.Context(), a.DB, r.PathValue("projectId"), u.ID)
	if err != nil {
		fail(w, 404, "not_found")
		return
	}
	if !scope.canRead() && !scope.canManage() {
		fail(w, 403, "forbidden")
		return
	}
	rows, err := a.DB.Query(r.Context(), `SELECT id,project_id,email,team_role,project_role,status,expires_at,delivery FROM invitations WHERE project_id=$1 ORDER BY expires_at DESC,id`, r.PathValue("projectId"))
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer rows.Close()
	entries := []wire.Invitation{}
	for rows.Next() {
		var v invitationMeta
		if err = rows.Scan(&v.entry.ID, &v.entry.ProjectID, &v.entry.Email, &v.entry.TeamRole, &v.entry.ProjectRole, &v.entry.Status, &v.expires, &v.entry.Delivery); err != nil {
			dbFailure(w, err)
			return
		}
		v.entry.ExpiresAt = v.expires.UTC().Format(time.RFC3339)
		v.entry.Status = a.invitationStatus(v)
		entries = append(entries, v.entry)
	}
	if rows.Err() != nil {
		dbFailure(w, rows.Err())
		return
	}
	success(w, entries)
}
func validInvite(req wire.InviteRequest) bool {
	parsed, err := mail.ParseAddress(req.Email)
	return err == nil && parsed.Address == req.Email && !strings.ContainsAny(req.Email, "\r\n") && (req.TeamRole == "member" || req.TeamRole == "admin") && validProjectRole(string(req.ProjectRole)) && (req.Days == 1 || req.Days == 7 || req.Days == 30)
}
func existingProjectEmail(ctx context.Context, q queryRower, pid, email string) (bool, error) {
	var exists bool
	err := q.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 AND u.email=$2)`, pid, email).Scan(&exists)
	return exists, err
}
func (a *App) insertInvitation(ctx context.Context, tx pgx.Tx, pid string, actor wire.User, req wire.InviteRequest) (wire.Invitation, string, error) {
	code := token()
	entry := wire.Invitation{ID: id(), ProjectID: pid, Email: req.Email, TeamRole: req.TeamRole, ProjectRole: req.ProjectRole, Status: "pending", ExpiresAt: a.Now().Add(time.Duration(req.Days) * 24 * time.Hour).UTC().Format(time.RFC3339), Delivery: "disabled"}
	_, err := tx.Exec(ctx, `INSERT INTO invitations(id,project_id,email,team_role,project_role,status,expires_at,digest,created_by,delivery) VALUES($1,$2,$3,$4,$5,'pending',$6,$7,$8,'disabled')`, entry.ID, pid, req.Email, req.TeamRole, req.ProjectRole, a.Now().Add(time.Duration(req.Days)*24*time.Hour), digest(code), actor.ID)
	return entry, code, err
}
func (a *App) deliverInvitation(ctx context.Context, entry *wire.Invitation, code string) {
	if a.Mail == nil {
		return
	}
	entry.Delivery = "sent"
	if a.Mail.Send(ctx, entry.Email, "MCP Studio invitation", a.Config.Origin+"/invitations/"+entry.ID+"\nEnter this one-time invitation code on the invitation page:\n"+code) != nil {
		entry.Delivery = "failed"
	}
	if _, err := a.DB.Exec(ctx, `UPDATE invitations SET delivery=$2 WHERE id=$1`, entry.ID, entry.Delivery); err != nil {
		entry.Delivery = "failed"
	}
}
func (a *App) createInvitation(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	var req wire.InviteRequest
	if !decode(w, r, &req) {
		return
	}
	req.Email = canonical(req.Email)
	if !validInvite(req) {
		fail(w, 400, "invalid_invitation")
		return
	}
	tx, scope, ok := a.projectWrite(w, r, u)
	if !ok {
		return
	}
	ctx := r.Context()
	defer tx.Rollback(ctx)
	pid := r.PathValue("projectId")
	if !authorizedInvite(ctx, tx, pid, u.ID, string(req.TeamRole)) || req.Email == u.Email {
		fail(w, 403, "forbidden")
		return
	}
	exists, err := existingProjectEmail(ctx, tx, pid, req.Email)
	if err != nil {
		dbFailure(w, err)
		return
	}
	if exists {
		fail(w, 409, "already_member")
		return
	}
	var pending bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM invitations WHERE project_id=$1 AND email=$2 AND status='pending' AND expires_at>$3)`, pid, req.Email, a.Now()).Scan(&pending)
	if err != nil {
		dbFailure(w, err)
		return
	}
	if pending {
		fail(w, 409, "pending_invitation")
		return
	}
	if _, err = tx.Exec(ctx, `UPDATE invitations SET status='superseded' WHERE project_id=$1 AND email=$2 AND status='pending'`, pid, req.Email); err != nil {
		dbFailure(w, err)
		return
	}
	entry, code, err := a.insertInvitation(ctx, tx, pid, u, req)
	if err != nil {
		dbFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "invitation.created", entry.ID, ""); err != nil {
		dbFailure(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		dbFailure(w, err)
		return
	}
	a.deliverInvitation(ctx, &entry, code)
	success(w, entry)
}
func (a *App) revokeInvitation(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	tx, scope, ok := a.projectWrite(w, r, u)
	if !ok {
		return
	}
	ctx := r.Context()
	defer tx.Rollback(ctx)
	v, err := readInvitation(ctx, tx, r.PathValue("id"))
	if err != nil || v.entry.ProjectID != r.PathValue("projectId") {
		fail(w, 404, "not_found")
		return
	}
	if !authorizedInvite(ctx, tx, v.entry.ProjectID, u.ID, string(v.entry.TeamRole)) {
		fail(w, 403, "forbidden")
		return
	}
	if v.entry.Status != "pending" {
		fail(w, 409, "invitation_terminal")
		return
	}
	if _, err = tx.Exec(ctx, `UPDATE invitations SET status='revoked' WHERE id=$1`, v.entry.ID); err != nil {
		dbFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, v.entry.ProjectID, u.ID, "invitation.revoked", v.entry.ID, ""); err != nil {
		dbFailure(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		dbFailure(w, err)
		return
	}
	success(w, wire.Accepted{Ok: true})
}
func (a *App) resendInvitation(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	tx, scope, ok := a.projectWrite(w, r, u)
	if !ok {
		return
	}
	ctx := r.Context()
	defer tx.Rollback(ctx)
	v, err := readInvitation(ctx, tx, r.PathValue("id"))
	if err != nil || v.entry.ProjectID != r.PathValue("projectId") {
		fail(w, 404, "not_found")
		return
	}
	if !authorizedInvite(ctx, tx, v.entry.ProjectID, u.ID, string(v.entry.TeamRole)) {
		fail(w, 403, "forbidden")
		return
	}
	if v.entry.Status != "pending" || v.entry.Email == u.Email {
		fail(w, 409, "invitation_terminal")
		return
	}
	exists, err := existingProjectEmail(ctx, tx, v.entry.ProjectID, v.entry.Email)
	if err != nil {
		dbFailure(w, err)
		return
	}
	if exists {
		fail(w, 409, "already_member")
		return
	}
	if _, err = tx.Exec(ctx, `UPDATE invitations SET status='superseded' WHERE project_id=$1 AND email=$2 AND status='pending'`, v.entry.ProjectID, v.entry.Email); err != nil {
		dbFailure(w, err)
		return
	}
	entry, code, err := a.insertInvitation(ctx, tx, v.entry.ProjectID, u, wire.InviteRequest{Email: v.entry.Email, TeamRole: v.entry.TeamRole, ProjectRole: v.entry.ProjectRole, Days: 7})
	if err != nil {
		dbFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, v.entry.ProjectID, u.ID, "invitation.resent", entry.ID, ""); err != nil {
		dbFailure(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		dbFailure(w, err)
		return
	}
	a.deliverInvitation(ctx, &entry, code)
	success(w, entry)
}
func (a *App) invitationEntry(w http.ResponseWriter, r *http.Request) {
	if !a.throttle(r) {
		fail(w, 429, "rate_limited")
		return
	}
	v, err := readInvitation(r.Context(), a.DB, r.PathValue("id"))
	if err != nil {
		fail(w, 404, "not_found")
		return
	}
	emailParts := strings.SplitN(v.entry.Email, "@", 2)
	hint := "***"
	if len(emailParts) == 2 {
		hint = "***@" + emailParts[1]
	}
	success(w, wire.InviteEntry{ID: v.entry.ID, ProjectName: v.projectName, EmailHint: hint, Status: a.invitationStatus(v), ExpiresAt: v.entry.ExpiresAt})
}
func (a *App) acceptInvitation(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	var req wire.TokenRequest
	if !decode(w, r, &req) {
		return
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer tx.Rollback(ctx)
	v, err := readInvitation(ctx, tx, r.PathValue("id"))
	if err != nil {
		fail(w, 400, "invalid_invitation")
		return
	}
	if err = lockTeamTx(ctx, tx, v.teamID); err != nil {
		dbFailure(w, err)
		return
	}
	v, err = readInvitation(ctx, tx, r.PathValue("id"))
	if err != nil || subtle.ConstantTimeCompare([]byte(v.tokenDigest), []byte(digest(req.Token))) != 1 {
		fail(w, 400, "invalid_invitation")
		return
	}
	if canonical(u.Email) != v.entry.Email {
		fail(w, 403, "email_mismatch")
		return
	}
	if !authorizedInvite(ctx, tx, v.entry.ProjectID, v.createdBy, string(v.entry.TeamRole)) {
		fail(w, 403, "invitation_sender_forbidden")
		return
	}
	if v.entry.Status == "accepted" && v.acceptedBy == u.ID {
		success(w, wire.Accepted{Ok: true})
		return
	}
	if a.invitationStatus(v) != "pending" {
		fail(w, 400, "invalid_invitation")
		return
	}
	if _, err = tx.Exec(ctx, `INSERT INTO team_members VALUES($1,$2,$3) ON CONFLICT(team_id,user_id) DO NOTHING`, v.teamID, u.ID, v.entry.TeamRole); err != nil {
		dbFailure(w, err)
		return
	}
	if _, err = tx.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,$3) ON CONFLICT(project_id,user_id) DO NOTHING`, v.entry.ProjectID, u.ID, v.entry.ProjectRole); err != nil {
		dbFailure(w, err)
		return
	}
	if err = a.restorePrivateRecords(ctx, tx, v.entry.ProjectID, u.ID); err != nil {
		dbFailure(w, err)
		return
	}
	if _, err = tx.Exec(ctx, `UPDATE invitations SET status='accepted',accepted_by=$2 WHERE id=$1`, v.entry.ID, u.ID); err != nil {
		dbFailure(w, err)
		return
	}
	if err = audit(ctx, tx, v.teamID, v.entry.ProjectID, u.ID, "invitation.accepted", v.entry.ID, ""); err != nil {
		dbFailure(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		dbFailure(w, err)
		return
	}
	success(w, wire.Accepted{Ok: true})
}
