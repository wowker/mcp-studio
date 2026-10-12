package platform

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"mcp-studio/internal/wire"
	"net/http"
	"strings"
)

type queryRower interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}
type projectAccess struct{ teamID, teamRole, projectRole string }

func (s projectAccess) canManage() bool {
	return s.teamRole == "owner" || s.teamRole == "admin" || s.projectRole == "maintainer"
}
func (s projectAccess) canRead() bool { return s.teamRole != "" && s.projectRole != "" }
func lockTeamTx(ctx context.Context, tx pgx.Tx, teamID string) error {
	var found string
	return tx.QueryRow(ctx, `SELECT id FROM teams WHERE id=$1 FOR UPDATE`, teamID).Scan(&found)
}
func projectScope(ctx context.Context, q queryRower, projectID, userID string) (projectAccess, error) {
	var scope projectAccess
	err := q.QueryRow(ctx, `SELECT p.team_id,COALESCE(tm.role,''),CASE WHEN tm.role IS NOT NULL THEN COALESCE(pm.role,'') ELSE '' END FROM projects p LEFT JOIN team_members tm ON tm.team_id=p.team_id AND tm.user_id=$2 LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2 WHERE p.id=$1`, projectID, userID).Scan(&scope.teamID, &scope.teamRole, &scope.projectRole)
	return scope, err
}
func authorizedInvite(ctx context.Context, q queryRower, projectID, actorID, invitedTeamRole string) bool {
	s, err := projectScope(ctx, q, projectID, actorID)
	if err != nil || s.teamRole == "" {
		return false
	}
	if invitedTeamRole == "admin" {
		return s.teamRole == "owner"
	}
	return invitedTeamRole == "member" && s.canManage()
}
func dbFailure(w http.ResponseWriter, err error) {
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		fail(w, 409, "already_exists")
		return
	}
	fail(w, 503, "database_unavailable")
}
func (a *App) projectValue(ctx context.Context, q queryRower, projectID, userID string) (wire.Project, error) {
	var p wire.Project
	scope, err := projectScope(ctx, q, projectID, userID)
	if err != nil {
		return p, err
	}
	err = q.QueryRow(ctx, `SELECT id,team_id,name,description FROM projects WHERE id=$1`, projectID).Scan(&p.ID, &p.TeamID, &p.Name, &p.Description)
	p.Role = scope.projectRole
	p.CanRead = scope.canRead()
	p.CanManage = scope.canManage()
	p.CanTakeover = scope.teamRole == "owner" && scope.projectRole != "maintainer"
	return p, err
}
func (a *App) projectRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/teams/{teamId}/projects", a.listProjects)
	mux.HandleFunc("POST /api/v1/teams/{teamId}/projects", a.createProject)
	mux.HandleFunc("GET /api/v1/projects/{projectId}", a.getProject)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/takeover", a.takeoverProject)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/audit", a.projectAudit)
}
func (a *App) listProjects(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	var role string
	teamID := r.PathValue("teamId")
	if err := a.DB.QueryRow(r.Context(), `SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2`, teamID, u.ID).Scan(&role); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 403, "forbidden")
		} else {
			dbFailure(w, err)
		}
		return
	}
	rows, err := a.DB.Query(r.Context(), `SELECT p.id,p.team_id,p.name,p.description,COALESCE(pm.role,'') FROM projects p LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2 WHERE p.team_id=$1 AND ($3 IN ('owner','admin') OR pm.user_id IS NOT NULL) ORDER BY p.name_key,p.id`, teamID, u.ID, role)
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer rows.Close()
	projects := []wire.Project{}
	for rows.Next() {
		var p wire.Project
		if err = rows.Scan(&p.ID, &p.TeamID, &p.Name, &p.Description, &p.Role); err != nil {
			dbFailure(w, err)
			return
		}
		p.CanRead = p.Role != ""
		p.CanManage = role == "owner" || role == "admin" || p.Role == "maintainer"
		p.CanTakeover = role == "owner" && p.Role != "maintainer"
		projects = append(projects, p)
	}
	if rows.Err() != nil {
		dbFailure(w, rows.Err())
		return
	}
	success(w, projects)
}
func (a *App) createProject(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	var req wire.ProjectRequest
	if !decode(w, r, &req) {
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		fail(w, 400, "name_required")
		return
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer tx.Rollback(ctx)
	teamID := r.PathValue("teamId")
	if err = lockTeamTx(ctx, tx, teamID); err != nil {
		fail(w, 403, "forbidden")
		return
	}
	var role string
	if err = tx.QueryRow(ctx, `SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2`, teamID, u.ID).Scan(&role); err != nil || (role != "owner" && role != "admin") {
		fail(w, 403, "forbidden")
		return
	}
	pid := id()
	if _, err = tx.Exec(ctx, `INSERT INTO projects VALUES($1,$2,$3,$4,$5)`, pid, teamID, req.Name, canonical(req.Name), req.Description); err != nil {
		dbFailure(w, err)
		return
	}
	if _, err = tx.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,'maintainer')`, pid, u.ID); err != nil {
		dbFailure(w, err)
		return
	}
	if err = audit(ctx, tx, teamID, pid, u.ID, "project.created", pid, ""); err != nil {
		dbFailure(w, err)
		return
	}
	p, err := a.projectValue(ctx, tx, pid, u.ID)
	if err != nil {
		dbFailure(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		dbFailure(w, err)
		return
	}
	success(w, p)
}
func (a *App) getProject(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	p, err := a.projectValue(r.Context(), a.DB, r.PathValue("projectId"), u.ID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			fail(w, 404, "not_found")
		} else {
			dbFailure(w, err)
		}
		return
	}
	// This endpoint returns directory/access metadata, never project content.
	if !p.CanRead && !p.CanManage {
		fail(w, 403, "forbidden")
		return
	}
	success(w, p)
}
func (a *App) takeoverProject(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	var req wire.TakeoverRequest
	if !decode(w, r, &req) {
		return
	}
	req.Reason = strings.TrimSpace(req.Reason)
	if !req.Confirmed || req.Reason == "" {
		fail(w, 400, "confirmation_required")
		return
	}
	ctx := r.Context()
	pid := r.PathValue("projectId")
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer tx.Rollback(ctx)
	scope, err := projectScope(ctx, tx, pid, u.ID)
	if err != nil {
		fail(w, 404, "not_found")
		return
	}
	if err = lockTeamTx(ctx, tx, scope.teamID); err != nil {
		dbFailure(w, err)
		return
	}
	scope, err = projectScope(ctx, tx, pid, u.ID)
	if err != nil || scope.teamRole != "owner" {
		fail(w, 403, "forbidden")
		return
	}
	if scope.projectRole != "maintainer" {
		if _, err = tx.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,'maintainer') ON CONFLICT(project_id,user_id) DO UPDATE SET role='maintainer'`, pid, u.ID); err != nil {
			dbFailure(w, err)
			return
		}
		if err = audit(ctx, tx, scope.teamID, pid, u.ID, "project.taken_over", pid, req.Reason); err != nil {
			dbFailure(w, err)
			return
		}
	}
	p, err := a.projectValue(ctx, tx, pid, u.ID)
	if err != nil {
		dbFailure(w, err)
		return
	}
	if err = tx.Commit(ctx); err != nil {
		dbFailure(w, err)
		return
	}
	success(w, p)
}
func (a *App) projectAudit(w http.ResponseWriter, r *http.Request) {
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	scope, err := projectScope(r.Context(), a.DB, r.PathValue("projectId"), u.ID)
	if err != nil {
		fail(w, 404, "not_found")
		return
	}
	if !scope.canManage() && !scope.canRead() {
		fail(w, 403, "forbidden")
		return
	}
	rows, err := a.DB.Query(r.Context(), `SELECT id,project_id,actor_id,action,reason,created_at::text FROM audits WHERE project_id=$1 ORDER BY created_at,id`, r.PathValue("projectId"))
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer rows.Close()
	entries := []wire.Audit{}
	for rows.Next() {
		var entry wire.Audit
		if err = rows.Scan(&entry.ID, &entry.ProjectID, &entry.ActorID, &entry.Action, &entry.Reason, &entry.CreatedAt); err != nil {
			dbFailure(w, err)
			return
		}
		entries = append(entries, entry)
	}
	if rows.Err() != nil {
		dbFailure(w, rows.Err())
		return
	}
	success(w, entries)
}
