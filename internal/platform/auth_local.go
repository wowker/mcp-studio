//go:build local

package platform

import (
	"context"
	"errors"
	"mcp-studio/internal/wire"
	"net/http"
	"time"
)

// projectRole short-circuits membership / role checks for the single local
// subject. It still validates that the target project exists (team_id filter),
// which is the only project-level isolation on a local instance — projects
// that do not exist continue to return not_found, and two projects do not leak
// data across each other via the same user_id.
func projectRole(ctx context.Context, q queryRower, projectID, userID string) (teamID, teamRole, projectRole string, ok bool) {
	var tID string
	err := q.QueryRow(ctx, `SELECT team_id FROM projects WHERE id=$1`, projectID).Scan(&tID)
	if err != nil || tID == "" {
		return "", "", "", false
	}
	return tID, "owner", "maintainer", true
}

// teamRoleOnTeam short-circuits to owner when the target team exists. It does
// not consult team_members because the local subject owns whatever team it has
// access to; creation happens in E05 startup.
func teamRoleOnTeam(ctx context.Context, q queryRower, teamID, userID string) (role string, ok bool) {
	var tID string
	err := q.QueryRow(ctx, `SELECT id FROM teams WHERE id=$1`, teamID).Scan(&tID)
	if err != nil || tID == "" {
		return "", false
	}
	return "owner", true
}

// authorizedInviteRole always authorizes invitation for the local subject as
// long as the project exists. The invitation endpoints remain in the schema
// but are inoperative on a single-subject local edition — no human outside the
// local subject can authenticate.
func authorizedInviteRole(ctx context.Context, q queryRower, projectID, actorID, invitedTeamRole string) bool {
	var tID string
	err := q.QueryRow(ctx, `SELECT team_id FROM projects WHERE id=$1`, projectID).Scan(&tID)
	return err == nil && tID != ""
}

// requireUser returns the single local subject. No session, no Agent
// Authorization overhead — every handler proceeds directly to the local user.
// The ResponseWriter parameter is unused on the local edition (no in-edition
// auth errors to emit) but kept so both editions share a signature.
func requireUser(a *App, w http.ResponseWriter, r *http.Request, verified bool) (wire.User, bool) {
	if a.localSubject.ID == "" {
		return wire.User{}, false
	}
	return a.localSubject, true
}

// session reports the local subject as an always-valid session. The local
// edition has no login flow and no cookie sessions (规格: 免登录，本地主体恒为
// 当前主体); without this the frontend bootstrap would land on the sign-in
// page. Expiry is refreshed on every read; CSRF stays empty because csrfOk is
// always true here.
func (a *App) session(r *http.Request) (wire.Session, error) {
	if a.localSubject.ID == "" {
		return wire.Session{}, errors.New("no local subject")
	}
	return wire.Session{
		User:      a.localSubject,
		Teams:     a.localTeams,
		Csrf:      "",
		ExpiresAt: a.Now().Add(a.Config.Idle).UTC().Format(time.RFC3339),
	}, nil
}

// csrfOk is always true on the local edition: there is no cookie session, no
// third-party origin and no CSRF vector that does not also impersonate the
// local OS user.
func csrfOk(a *App, r *http.Request) bool { return true }

// lockTeamTxImpl only checks that the target team exists. The local edition
// has a single local subject and no concurrent writers on team/project rows —
// the team is already locked by being in the schema.
func lockTeamTxImpl(ctx context.Context, q queryRower, teamID string) error {
	var found string
	return q.QueryRow(ctx, `SELECT id FROM teams WHERE id=$1`, teamID).Scan(&found)
}
