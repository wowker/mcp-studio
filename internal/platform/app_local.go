//go:build local

package platform

import "mcp-studio/internal/wire"

// localSubject is the single immutable owner used by every handler on the
// single-binary local edition. It is populated once during startup (E05), not
// per request, and replaces the cookie/session subject entirely.
func (a *App) initLocalSubject(u wire.User, teams []wire.Team) {
	a.localSubject = u
	a.localTeams = teams
}
