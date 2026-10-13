package platform

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"io"
	"mcp-studio/internal/wire"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Mailer interface {
	Send(context.Context, string, string, string) error
}
type Config struct {
	Origin, BootstrapCredential, StaticDir        string
	BackupKey                                     []byte
	CookieSecure                                  bool
	Idle, Absolute                                time.Duration
	RecordCapacityBytes                           int64
	HistoryRetentionDays, MaxHistoryRetentionDays int
}
type App struct {
	DB                 *pgxpool.Pool
	Now                func() time.Time
	Config             Config
	Mail               Mailer
	recordCursorOnce   sync.Once
	recordCursorSecret [32]byte
}

func id() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic("random source unavailable")
	}
	return hex.EncodeToString(b)
}
func token() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic("random source unavailable")
	}
	return hex.EncodeToString(b)
}
func digest(s string) string    { d := sha256.Sum256([]byte(s)); return hex.EncodeToString(d[:]) }
func canonical(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
func success(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"data": v})
}
func fail(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(wire.Error{Error: struct {
		Code string `json:"code"`
	}{Code: code}})
}
func decode(w http.ResponseWriter, r *http.Request, v interface{}) bool {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		fail(w, 415, "json_required")
		return false
	}
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		fail(w, 400, "invalid_input")
		return false
	}
	if err := d.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		fail(w, 400, "invalid_input")
		return false
	}
	return true
}
func audit(ctx context.Context, tx pgx.Tx, teamID, projectID, actorID, action, targetID, reason string) error {
	_, err := tx.Exec(ctx, `INSERT INTO audits VALUES($1,NULLIF($2,''),$3,$4,$5,$6,$7,$8)`, id(), projectID, teamID, actorID, action, targetID, reason, time.Now().UTC())
	return err
}
func (a *App) cookieName() string {
	if a.Config.CookieSecure {
		return "__Host-mcp_studio_session"
	}
	return "mcp_studio_dev_session"
}
func (a *App) cookie(w http.ResponseWriter, value string, remove bool) {
	c := &http.Cookie{Name: a.cookieName(), Value: value, Path: "/", HttpOnly: true, Secure: a.Config.CookieSecure, SameSite: http.SameSiteLaxMode}
	if remove {
		c.MaxAge = -1
		c.Expires = time.Unix(1, 0)
	} else {
		c.MaxAge = int(a.Config.Absolute.Seconds())
	}
	http.SetCookie(w, c)
}
func (a *App) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		if err := a.DB.Ping(r.Context()); err != nil {
			fail(w, 503, "database_unavailable")
			return
		}
		success(w, wire.Health{Status: "ok", Version: "0.1.0"})
	})
	a.identityRoutes(mux)
	a.agentRoutes(mux)
	a.credentialRoutes(mux)
	a.projectRoutes(mux)
	a.memberRoutes(mux)
	a.configurationRoutes(mux)
	a.recordRoutes(mux)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "not_found") })
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "HEAD" {
			fail(w, 405, "method_not_allowed")
			return
		}
		if a.Config.StaticDir == "" {
			fail(w, 404, "not_found")
			return
		}
		clean := filepath.Clean(r.URL.Path)
		for _, seg := range strings.Split(clean, "/") {
			if strings.HasPrefix(seg, ".") {
				fail(w, 404, "not_found")
				return
			}
		}
		path := filepath.Join(a.Config.StaticDir, clean)
		info, err := os.Stat(path)
		if err == nil && !info.IsDir() {
			http.ServeFile(w, r, path)
			return
		}
		if filepath.Ext(clean) != "" {
			fail(w, 404, "not_found")
			return
		}
		http.ServeFile(w, r, filepath.Join(a.Config.StaticDir, "index.html"))
	})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https: http:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
		}
		if r.Header.Get("Authorization") != "" && r.URL.Path != "/api/v1/agent/exchange" && !agentAllowed(r) {
			fail(w, 403, "agent_scope_rejected")
			return
		}
		if r.Method != "GET" && r.Method != "HEAD" && r.Header.Get("Origin") != a.Config.Origin {
			fail(w, 403, "origin_rejected")
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/") && (strings.Contains(r.URL.RawQuery, "token") || strings.Contains(r.URL.RawQuery, "credential")) {
			fail(w, 400, "secret_in_url")
			return
		}
		mux.ServeHTTP(w, r)
	})
}
func (a *App) require(w http.ResponseWriter, r *http.Request, verified bool) (wire.User, bool) {
	if r.Header.Get("Authorization") != "" {
		return a.authenticateAgent(w, r)
	}
	s, err := a.session(r)
	if err != nil {
		a.cookie(w, "", true)
		fail(w, 401, "session_expired")
		return wire.User{}, false
	}
	if verified && !s.User.Verified {
		fail(w, 403, "email_unverified")
		return wire.User{}, false
	}
	if r.Method != "GET" && r.Method != "HEAD" && subtle.ConstantTimeCompare([]byte(r.Header.Get("X-CSRF-Token")), []byte(s.Csrf)) != 1 {
		fail(w, 403, "csrf_rejected")
		return wire.User{}, false
	}
	return s.User, true
}
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
func (a *App) throttle(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	now := a.Now()
	var n int
	err = a.DB.QueryRow(r.Context(), `INSERT INTO auth_limits(key,count,reset_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_limits.reset_at<=$3 THEN 1 ELSE auth_limits.count+1 END,reset_at=CASE WHEN auth_limits.reset_at<=$3 THEN $2 ELSE auth_limits.reset_at END RETURNING count`, digest(host), now.Add(time.Minute), now).Scan(&n)
	return err == nil && n <= 100
}
