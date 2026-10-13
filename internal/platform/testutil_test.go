package platform

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"mcp-studio/internal/testsupport"
	"mcp-studio/internal/wire"
	"mcp-studio/migrations"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

type message struct{ To, Subject, Body string }
type captureMail struct {
	mu       sync.Mutex
	messages []message
	err      error
}

func (m *captureMail) Send(ctx context.Context, to, subject, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.err != nil {
		return m.err
	}
	m.messages = append(m.messages, message{to, subject, body})
	return nil
}
func (m *captureMail) lastCode() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	if len(m.messages) == 0 {
		return ""
	}
	parts := strings.Split(m.messages[len(m.messages)-1].Body, "\n")
	return parts[len(parts)-1]
}
func testApp(t *testing.T) (*App, *captureMail) {
	t.Helper()
	url := os.Getenv("MCP_STUDIO_TEST_DATABASE_URL")
	if url == "" {
		t.Fatal("MCP_STUDIO_TEST_DATABASE_URL required")
	}
	ctx := context.Background()
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	schema, err := testsupport.CreateSchema(ctx, admin, url)
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if err = migrations.Apply(ctx, db); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close(); admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); admin.Close() })
	mail := &captureMail{}
	a := &App{DB: db, Now: func() time.Time { return time.Date(2026, 10, 13, 0, 0, 0, 0, time.UTC) }, Config: Config{Origin: "http://localhost", BootstrapCredential: "fixture-init", Idle: 8 * time.Hour, Absolute: 24 * time.Hour}, Mail: mail}
	return a, mail
}
func request(t *testing.T, a *App, method, path string, body interface{}, session *wire.Session, cookie *http.Cookie) (int, json.RawMessage, *http.Cookie) {
	t.Helper()
	data, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, strings.NewReader(string(data)))
	r.Header.Set("Origin", a.Config.Origin)
	r.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		r.AddCookie(cookie)
	}
	if session != nil {
		r.Header.Set("X-CSRF-Token", session.Csrf)
	}
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	var env struct {
		Data json.RawMessage `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &env)
	var ck *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.MaxAge != -1 {
			ck = c
		}
	}
	return w.Code, env.Data, ck
}
func owner(t *testing.T, a *App, mail *captureMail) (wire.Session, *http.Cookie) {
	t.Helper()
	code, _, _ := request(t, a, "POST", "/api/v1/initialize", wire.InitializeRequest{Credential: "fixture-init", Email: "owner@example.test", Name: "Owner", Password: "fixture-password-123", TeamName: "Team"}, nil, nil)
	if code != 200 {
		t.Fatalf("initialize status %d", code)
	}
	s, c := login(t, a, "owner@example.test")
	code, _, _ = request(t, a, "POST", "/api/v1/verification/request", nil, &s, c)
	if code != 200 {
		t.Fatalf("request verification %d", code)
	}
	code, _, _ = request(t, a, "POST", "/api/v1/verification/confirm", wire.TokenRequest{Token: mail.lastCode()}, nil, nil)
	if code != 200 {
		t.Fatalf("verify status %d", code)
	}
	return login(t, a, "owner@example.test")
}
func login(t *testing.T, a *App, email string) (wire.Session, *http.Cookie) {
	t.Helper()
	code, data, c := request(t, a, "POST", "/api/v1/login", wire.LoginRequest{Email: email, Password: "fixture-password-123"}, nil, nil)
	if code != 200 {
		t.Fatalf("login status %d", code)
	}
	var s wire.Session
	if err := json.Unmarshal(data, &s); err != nil {
		t.Fatal(err)
	}
	return s, c
}
func addUser(t *testing.T, a *App, email, teamID string, teamRole string) string {
	t.Helper()
	uid := id()
	hash, err := passwordHash("fixture-password-123")
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	if _, err = a.DB.Exec(ctx, `INSERT INTO users VALUES($1,$2,$3,$4,true)`, uid, email, email, hash); err != nil {
		t.Fatal(err)
	}
	if teamID != "" {
		if _, err = a.DB.Exec(ctx, `INSERT INTO team_members VALUES($1,$2,$3)`, teamID, uid, teamRole); err != nil {
			t.Fatal(err)
		}
	}
	return uid
}
func requireStatus(t *testing.T, got, want int) {
	t.Helper()
	if got != want {
		t.Fatal(fmt.Sprintf("status %d want %d", got, want))
	}
}
