//go:build !local

package platform

import (
	"context"
	"crypto/subtle"
	"errors"
	"github.com/jackc/pgx/v5"
	"mcp-studio/internal/wire"
	"net/http"
	"time"
)

// projectRole resolves cloud-edition membership by reading team_members and
// project_members. Returns ok=false when the project does not exist.
func projectRole(ctx context.Context, q queryRower, projectID, userID string) (teamID, teamRole, projectRole string, ok bool) {
	var tID, tRole, pRole string
	err := q.QueryRow(ctx, `SELECT p.team_id,COALESCE(tm.role,''),CASE WHEN tm.role IS NOT NULL THEN COALESCE(pm.role,'') ELSE '' END FROM projects p LEFT JOIN team_members tm ON tm.team_id=p.team_id AND tm.user_id=$2 LEFT JOIN project_members pm ON pm.project_id=p.id AND pm.user_id=$2 WHERE p.id=$1`, projectID, userID).Scan(&tID, &tRole, &pRole)
	if err != nil || tID == "" {
		return "", "", "", false
	}
	return tID, tRole, pRole, true
}

// teamRoleOnTeam resolves a user's cloud-edition team role from team_members.
func teamRoleOnTeam(ctx context.Context, q queryRower, teamID, userID string) (role string, ok bool) {
	err := q.QueryRow(ctx, `SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2`, teamID, userID).Scan(&role)
	if err != nil {
		return "", false
	}
	return role, true
}

// authorizedInviteRole checks whether the actor's cloud-edition membership
// permits the invited escalation target.
func authorizedInviteRole(ctx context.Context, q queryRower, projectID, actorID, invitedTeamRole string) bool {
	_, tRole, pRole, ok := projectRole(ctx, q, projectID, actorID)
	if !ok || tRole == "" {
		return false
	}
	switch invitedTeamRole {
	case "admin":
		return tRole == "owner"
	case "member":
		return tRole == "owner" || tRole == "admin" || pRole == "maintainer"
	}
	return false
}

// requireUser resolves the cloud-edition subject from either the Agent
// Authorization header or the cookie session. Verified flag is deferred to
// the caller.
func requireUser(a *App, w http.ResponseWriter, r *http.Request, verified bool) (wire.User, bool) {
	if r.Header.Get("Authorization") != "" {
		u, _ := a.authenticateAgent(w, r)
		if u.ID == "" {
			return wire.User{}, false
		}
		return u, true
	}
	s, err := a.session(r)
	if err != nil {
		return wire.User{}, false
	}
	return s.User, true
}

// session resolves the cloud-edition cookie session: it validates the digest,
// enforces idle/absolute expiry and refreshes last_seen. The local edition
// has no cookie sessions — its variant lives in auth_local.go.
func (a *App) session(r *http.Request) (wire.Session, error) {
	var s wire.Session
	c, err := r.Cookie(a.cookieName())
	if err != nil {
		return s, err
	}
	tx, err := a.DB.Begin(r.Context())
	if err != nil {
		return s, err
	}
	defer tx.Rollback(r.Context())
	var created, last time.Time
	err = tx.QueryRow(r.Context(), `SELECT u.id,u.email,u.name,u.verified,s.csrf,s.created_at,s.last_seen FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.digest=$1 FOR UPDATE OF s`, digest(c.Value)).Scan(&s.User.ID, &s.User.Email, &s.User.Name, &s.User.Verified, &s.Csrf, &created, &last)
	if err != nil {
		return s, err
	}
	now := a.Now()
	if !now.Before(last.Add(a.Config.Idle)) || !now.Before(created.Add(a.Config.Absolute)) {
		tx.Exec(r.Context(), `DELETE FROM sessions WHERE digest=$1`, digest(c.Value))
		tx.Commit(r.Context())
		return s, errors.New("expired")
	}
	if _, err = tx.Exec(r.Context(), `UPDATE sessions SET last_seen=$1 WHERE digest=$2`, now, digest(c.Value)); err != nil {
		return s, err
	}
	s.Teams = []wire.Team{}
	rows, err := tx.Query(r.Context(), `SELECT t.id,t.name,m.role FROM teams t JOIN team_members m ON m.team_id=t.id WHERE m.user_id=$1 ORDER BY t.name,t.id`, s.User.ID)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var team wire.Team
		if err = rows.Scan(&team.ID, &team.Name, &team.Role); err != nil {
			rows.Close()
			return s, err
		}
		s.Teams = append(s.Teams, team)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return s, err
	}
	expiry := now.Add(a.Config.Idle)
	if created.Add(a.Config.Absolute).Before(expiry) {
		expiry = created.Add(a.Config.Absolute)
	}
	s.ExpiresAt = expiry.UTC().Format(time.RFC3339)
	return s, tx.Commit(r.Context())
}

// csrfOk enforces CSRF tokens on non-GET/HEAD cloud-edition requests using the
// cookie-bound csrf secret stored alongside each session row. Agent bearer
// requests (Authorization header) are exempt — they carry their own proof.
func csrfOk(a *App, r *http.Request) bool {
	if r.Method == "GET" || r.Method == "HEAD" {
		return true
	}
	if r.Header.Get("Authorization") != "" {
		return true
	}
	c, err := r.Cookie(a.cookieName())
	if err != nil {
		return false
	}
	tx, err := a.DB.Begin(r.Context())
	if err != nil {
		return false
	}
	defer tx.Rollback(r.Context())
	var csrf string
	if err = tx.QueryRow(r.Context(), `SELECT s.csrf FROM sessions s WHERE s.digest=$1`, digest(c.Value)).Scan(&csrf); err != nil {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(csrf)) == 1
}

// lockTeamTxImpl performs FOR UPDATE row locking on the teams row referenced
// by the project. Cloud editions have multi-actor concurrency on team and
// project creation / takeover / membership writes, so the serialization lock
// is mandatory.
func lockTeamTxImpl(ctx context.Context, tx pgx.Tx, teamID string) error {
	var found string
	return tx.QueryRow(ctx, `SELECT id FROM teams WHERE id=$1 FOR UPDATE`, teamID).Scan(&found)
}
