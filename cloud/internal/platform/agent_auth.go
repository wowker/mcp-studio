package platform

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"mcp-studio/internal/wire"
	"net/http"
	"strings"
	"time"
)

type agentIdentity struct {
	User                                    wire.User
	DeviceID, Origin, SessionDigest, Digest string
	ExpiresAt                               time.Time
}
type agentContextKey struct{}

func agentFrom(r *http.Request) *agentIdentity {
	v, _ := r.Context().Value(agentContextKey{}).(*agentIdentity)
	return v
}
func bearer(r *http.Request) string {
	v := r.Header.Get("Authorization")
	if !strings.HasPrefix(v, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(v, "Bearer ")
}
func agentAllowed(r *http.Request) bool {
	p := r.URL.Path
	if p == "/api/v1/agent/session" {
		return r.Method == "GET" || r.Method == "DELETE"
	}
	seg := strings.Split(strings.Trim(p, "/"), "/")
	if len(seg) == 4 && seg[0] == "api" && seg[1] == "v1" && seg[2] == "projects" && r.Method == "GET" {
		return true
	}
	if len(seg) < 5 || seg[0] != "api" || seg[1] != "v1" || seg[2] != "projects" {
		return false
	}
	if r.Method == "GET" {
		if len(seg) == 5 {
			return oneOf(seg[4], "connections", "variables", "environments", "record-redaction-policy", "record-capacity")
		}
		if len(seg) == 6 {
			return oneOf(seg[4], "connections", "variables", "environments", "record-operations", "records")
		}
	}
	if r.Method == "POST" && len(seg) == 5 && seg[4] == "record-uploads" {
		return true
	}
	if len(seg) == 7 && seg[4] == "connections" && seg[6] == "session-access" {
		return r.Method == "POST"
	}
	return seg[4] == "connections" && len(seg) >= 7 && len(seg) <= 9 && seg[6] == "credential-backups" && ((len(seg) == 7 && (r.Method == "GET" || r.Method == "POST")) || (len(seg) == 8 && r.Method == "DELETE") || (len(seg) == 9 && seg[8] == "restore" && r.Method == "POST"))
}
func (a *App) agentValue(ctx context.Context, tx pgx.Tx, raw string) (agentIdentity, error) {
	var v agentIdentity
	var created, last time.Time
	err := tx.QueryRow(ctx, `SELECT u.id,u.email,u.name,u.verified,g.device_id,g.origin,g.session_digest,g.digest,g.expires_at,s.created_at,s.last_seen FROM agent_grants g JOIN sessions s ON s.digest=g.session_digest JOIN users u ON u.id=g.user_id AND u.id=s.user_id WHERE g.digest=$1 FOR UPDATE OF s,g`, digest(raw)).Scan(&v.User.ID, &v.User.Email, &v.User.Name, &v.User.Verified, &v.DeviceID, &v.Origin, &v.SessionDigest, &v.Digest, &v.ExpiresAt, &created, &last)
	if err != nil {
		return v, err
	}
	now := a.Now()
	if !v.User.Verified || v.Origin != a.Config.Origin || !now.Before(v.ExpiresAt) || !now.Before(last.Add(a.Config.Idle)) || !now.Before(created.Add(a.Config.Absolute)) {
		return v, errors.New("expired")
	}
	return v, nil
}
func (a *App) authenticateAgent(w http.ResponseWriter, r *http.Request) (wire.User, bool) {
	if r.Header.Get("Origin") != a.Config.Origin {
		fail(w, 403, "origin_rejected")
		return wire.User{}, false
	}
	if !agentAllowed(r) {
		fail(w, 403, "agent_scope_rejected")
		return wire.User{}, false
	}
	tx, err := a.DB.Begin(r.Context())
	if err != nil {
		dbFailure(w, err)
		return wire.User{}, false
	}
	defer tx.Rollback(r.Context())
	v, err := a.agentValue(r.Context(), tx, bearer(r))
	if err != nil {
		fail(w, 401, "agent_session_expired")
		return wire.User{}, false
	}
	if err = tx.Commit(r.Context()); err != nil {
		dbFailure(w, err)
		return wire.User{}, false
	}
	*r = *r.WithContext(context.WithValue(r.Context(), agentContextKey{}, &v))
	return v.User, true
}
func (a *App) agentRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/v1/agent/proofs", a.createAgentProof)
	mux.HandleFunc("POST /api/v1/agent/exchange", a.exchangeAgentProof)
	mux.HandleFunc("GET /api/v1/agent/session", a.getAgentSession)
	mux.HandleFunc("DELETE /api/v1/agent/session", a.deleteAgentSession)
	mux.HandleFunc("DELETE /api/v1/agent/devices/{deviceId}", a.deleteAgentDevice)
}
func (a *App) createAgentProof(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "" {
		fail(w, 403, "cookie_required")
		return
	}
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	var input wire.AgentProofRequest
	if !decode(w, r, &input) {
		return
	}
	if !validRecordID(input.DeviceID) {
		fail(w, 400, "invalid_device")
		return
	}
	c, _ := r.Cookie(a.cookieName())
	raw := token()
	expires := a.Now().Add(time.Minute)
	_, err := a.DB.Exec(r.Context(), `INSERT INTO agent_proofs VALUES($1,$2,$3,$4,$5,$6)`, digest(raw), digest(c.Value), u.ID, input.DeviceID, a.Config.Origin, expires)
	if err != nil {
		dbFailure(w, err)
		return
	}
	success(w, wire.AgentProof{Proof: raw, UserID: u.ID, DeviceID: input.DeviceID, Origin: a.Config.Origin, ExpiresAt: expires.UTC().Format(time.RFC3339)})
}
func (a *App) exchangeAgentProof(w http.ResponseWriter, r *http.Request) {
	// Browser Fetch controls Sec-* headers: a credentials-omitted same-origin
	// request must not receive the delegated bearer. This is in addition to the
	// one-time proof, exact Origin binding and Cookie exclusion.
	for name := range r.Header {
		if strings.HasPrefix(strings.ToLower(name), "sec-fetch-") {
			fail(w, 403, "agent_exchange_required")
			return
		}
	}

	if _, err := r.Cookie(a.cookieName()); err == nil {
		fail(w, 403, "agent_exchange_required")
		return
	}
	var input wire.AgentProofRequest
	if !decode(w, r, &input) {
		return
	}
	tx, err := a.DB.Begin(r.Context())
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	var uid, dev, origin, session string
	var expiry, created, last time.Time
	var verified bool
	err = tx.QueryRow(r.Context(), `SELECT p.user_id,p.device_id,p.origin,p.session_digest,p.expires_at,s.created_at,s.last_seen,u.verified FROM agent_proofs p JOIN sessions s ON s.digest=p.session_digest JOIN users u ON u.id=p.user_id WHERE p.digest=$1 FOR UPDATE OF s,p`, digest(bearer(r))).Scan(&uid, &dev, &origin, &session, &expiry, &created, &last, &verified)
	now := a.Now()
	if err != nil || dev != input.DeviceID || origin != a.Config.Origin || r.Header.Get("Origin") != origin || !verified || !now.Before(expiry) || !now.Before(last.Add(a.Config.Idle)) || !now.Before(created.Add(a.Config.Absolute)) {
		fail(w, 401, "invalid_agent_proof")
		return
	}
	expiry = now.Add(15 * time.Minute)
	if x := last.Add(a.Config.Idle); x.Before(expiry) {
		expiry = x
	}
	if x := created.Add(a.Config.Absolute); x.Before(expiry) {
		expiry = x
	}
	raw := token()
	if _, err = tx.Exec(r.Context(), `DELETE FROM agent_proofs WHERE digest=$1`, digest(bearer(r))); err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO agent_grants VALUES($1,$2,$3,$4,$5,$6)`, digest(raw), session, uid, dev, origin, expiry)
	}
	if err != nil {
		dbFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, wire.AgentGrant{Token: raw, UserID: uid, DeviceID: dev, Origin: origin, ExpiresAt: expiry.UTC().Format(time.RFC3339)}, "")
}
func (a *App) getAgentSession(w http.ResponseWriter, r *http.Request) {
	if bearer(r) == "" {
		fail(w, 401, "agent_bearer_required")
		return
	}
	if _, ok := a.require(w, r, true); !ok {
		return
	}
	v := agentFrom(r)
	success(w, wire.AgentSession{UserID: v.User.ID, DeviceID: v.DeviceID, Origin: v.Origin, ExpiresAt: v.ExpiresAt.UTC().Format(time.RFC3339)})
}
func (a *App) deleteAgentSession(w http.ResponseWriter, r *http.Request) {
	if bearer(r) == "" {
		fail(w, 401, "agent_bearer_required")
		return
	}
	if _, ok := a.require(w, r, true); !ok {
		return
	}
	_, err := a.DB.Exec(r.Context(), `DELETE FROM agent_grants WHERE digest=$1`, digest(bearer(r)))
	if err != nil {
		dbFailure(w, err)
		return
	}
	success(w, wire.Accepted{Ok: true})
}
func (a *App) deleteAgentDevice(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Authorization") != "" {
		fail(w, 403, "cookie_required")
		return
	}
	u, ok := a.require(w, r, true)
	if !ok {
		return
	}
	tx, err := a.DB.Begin(r.Context())
	if err != nil {
		dbFailure(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `SELECT digest FROM sessions WHERE user_id=$1 FOR UPDATE`, u.ID); err == nil {
		_, err = tx.Exec(r.Context(), `DELETE FROM agent_proofs WHERE user_id=$1 AND device_id=$2`, u.ID, r.PathValue("deviceId"))
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `DELETE FROM agent_grants WHERE user_id=$1 AND device_id=$2`, u.ID, r.PathValue("deviceId"))
	}
	if err != nil {
		dbFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, wire.Accepted{Ok: true}, "")
}
