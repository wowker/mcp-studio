package platform

import (
	"context"
	"encoding/json"
	"errors"
	"mcp-studio/internal/wire"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestInitializeConcurrentOnlyOneOwner(t *testing.T) {
	a, _ := testApp(t)
	var wg sync.WaitGroup
	codes := make(chan int, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			c, _, _ := request(t, a, "POST", "/api/v1/initialize", wire.InitializeRequest{Credential: "fixture-init", Email: "owner@example.test", Name: "Owner", Password: "fixture-password-123", TeamName: "Team"}, nil, nil)
			codes <- c
		}()
	}
	wg.Wait()
	close(codes)
	n := 0
	for c := range codes {
		if c == 200 {
			n++
		} else if c != 409 {
			t.Fatalf("unexpected status %d", c)
		}
	}
	if n != 1 {
		t.Fatalf("initialized %d times", n)
	}
	var count int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM team_members WHERE role='owner'`).Scan(&count)
	if count != 1 {
		t.Fatal(count)
	}
}
func TestLoginCookieCsrfExpirationAndLogout(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	code, _, _ := request(t, a, "POST", "/api/v1/login", wire.LoginRequest{Email: s.User.Email, Password: "wrong"}, nil, nil)
	requireStatus(t, code, 401)
	if !c.HttpOnly || c.SameSite != 2 || c.Path != "/" {
		t.Fatal("insecure session cookie")
	}
	a.Config.CookieSecure = true
	_, secure := login(t, a, s.User.Email)
	if !secure.Secure || secure.Name != "__Host-mcp_studio_session" {
		t.Fatal("secure cookie missing")
	}
	a.Config.CookieSecure = false
	r := httptest.NewRequest("POST", "/api/v1/logout", nil)
	r.Header.Set("Origin", a.Config.Origin)
	r.AddCookie(c)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	requireStatus(t, w.Code, 403)
	code, _, _ = request(t, a, "POST", "/api/v1/logout", nil, &s, c)
	requireStatus(t, code, 200)
	code, _, _ = request(t, a, "GET", "/api/v1/session", nil, nil, c)
	requireStatus(t, code, 401)
	s, c = login(t, a, s.User.Email)
	base := a.Now()
	a.Now = func() time.Time { return base.Add(8 * time.Hour) }
	code, _, _ = request(t, a, "GET", "/api/v1/session", nil, nil, c)
	requireStatus(t, code, 401)
}
func TestSessionAbsoluteExpiresDespiteActivity(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	base := a.Now()
	for _, h := range []int{7, 14, 21} {
		hour := h
		a.Now = func() time.Time { return base.Add(time.Duration(hour) * time.Hour) }
		code, _, _ := request(t, a, "GET", "/api/v1/session", nil, &s, c)
		requireStatus(t, code, 200)
	}
	a.Now = func() time.Time { return base.Add(24 * time.Hour) }
	code, _, _ := request(t, a, "GET", "/api/v1/session", nil, &s, c)
	requireStatus(t, code, 401)
}
func TestVerificationSingleUseExpiryAndMailFailure(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	m.err = errors.New("fixture mail failure")
	code, _, _ := request(t, a, "POST", "/api/v1/verification/request", nil, &s, c)
	requireStatus(t, code, 503)
	m.err = nil
	code, _, _ = request(t, a, "POST", "/api/v1/verification/request", nil, &s, c)
	requireStatus(t, code, 200)
	tok := m.lastCode()
	code, _, _ = request(t, a, "POST", "/api/v1/verification/confirm", wire.TokenRequest{Token: tok}, nil, nil)
	requireStatus(t, code, 200)
	code, _, _ = request(t, a, "POST", "/api/v1/verification/confirm", wire.TokenRequest{Token: tok}, nil, nil)
	requireStatus(t, code, 400)
	request(t, a, "POST", "/api/v1/verification/request", nil, &s, c)
	tok = m.lastCode()
	base := a.Now()
	a.Now = func() time.Time { return base.Add(time.Hour) }
	code, _, _ = request(t, a, "POST", "/api/v1/verification/confirm", wire.TokenRequest{Token: tok}, nil, nil)
	requireStatus(t, code, 400)
}
func TestResetSingleUseRevokesSessions(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	code, _, _ := request(t, a, "POST", "/api/v1/password/request", wire.EmailRequest{Email: s.User.Email}, nil, nil)
	requireStatus(t, code, 200)
	tok := m.lastCode()
	code, _, _ = request(t, a, "POST", "/api/v1/password/reset", wire.PasswordResetRequest{Token: tok, Password: "changed-password-123"}, nil, nil)
	requireStatus(t, code, 200)
	code, _, _ = request(t, a, "GET", "/api/v1/session", nil, nil, c)
	requireStatus(t, code, 401)
	code, _, _ = request(t, a, "POST", "/api/v1/password/reset", wire.PasswordResetRequest{Token: tok, Password: "changed-password-123"}, nil, nil)
	requireStatus(t, code, 400)
}
func TestPublicRegistrationAndOriginRejected(t *testing.T) {
	a, _ := testApp(t)
	code, _, _ := request(t, a, "POST", "/api/v1/register", map[string]string{"email": "nobody@example.test"}, nil, nil)
	requireStatus(t, code, 404)
	r := httptest.NewRequest("POST", "/api/v1/login", strings.NewReader(`{"email":"x","password":"p"}`))
	r.Header.Set("Origin", "http://evil.test")
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	requireStatus(t, w.Code, 403)
}

func TestLoginWithOldCookieCreatesFreshSession(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	code, data, fresh := request(t, a, "POST", "/api/v1/login", wire.LoginRequest{Email: s.User.Email, Password: "fixture-password-123"}, nil, c)
	requireStatus(t, code, 200)
	var got wire.Session
	json.Unmarshal(data, &got)
	if fresh == nil || fresh.Value == c.Value || got.Csrf == s.Csrf {
		t.Fatal("old cookie reused for newly issued session")
	}
}
func TestMissingMailCannotVerifyBootstrapOwner(t *testing.T) {
	a, _ := testApp(t)
	a.Mail = nil
	code, _, _ := request(t, a, "POST", "/api/v1/initialize", wire.InitializeRequest{Credential: "fixture-init", Email: "owner@example.test", Name: "Owner", Password: "fixture-password-123", TeamName: "Team"}, nil, nil)
	requireStatus(t, code, 200)
	s, c := login(t, a, "owner@example.test")
	if s.User.Verified {
		t.Fatal("no-mail owner must not be verified")
	}
	code, _, _ = request(t, a, "POST", "/api/v1/verification/request", nil, &s, c)
	requireStatus(t, code, 503)
	code, _, _ = request(t, a, "POST", "/api/v1/teams/"+s.Teams[0].ID+"/projects", wire.ProjectRequest{Name: "No verification"}, &s, c)
	requireStatus(t, code, 403)
}
func TestInviteRegistrationRequiresValidCodeAndDoesNotJoinAutomatically(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	code, data, _ := request(t, a, "POST", "/api/v1/teams/"+s.Teams[0].ID+"/projects", wire.ProjectRequest{Name: "Project"}, &s, c)
	requireStatus(t, code, 200)
	var p wire.Project
	json.Unmarshal(data, &p)
	code, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations", wire.InviteRequest{Email: "new@example.test", TeamRole: "member", ProjectRole: "developer", Days: 7}, &s, c)
	requireStatus(t, code, 200)
	tok := m.lastCode()
	code, _, _ = request(t, a, "POST", "/api/v1/invitation/register", wire.RegisterRequest{Token: tok, Email: "wrong@example.test", Name: "New", Password: "fixture-password-123"}, nil, nil)
	requireStatus(t, code, 400)
	code, _, _ = request(t, a, "POST", "/api/v1/invitation/register", wire.RegisterRequest{Token: tok, Email: "new@example.test", Name: "New", Password: "fixture-password-123"}, nil, nil)
	requireStatus(t, code, 200)
	joined, cookie := login(t, a, "new@example.test")
	if joined.User.Verified || len(joined.Teams) != 0 {
		t.Fatal("registration must not verify email or accept invitation")
	}
	verification := m.lastCode()
	code, _, _ = request(t, a, "POST", "/api/v1/verification/confirm", wire.TokenRequest{Token: verification}, nil, nil)
	requireStatus(t, code, 200)
	code, _, _ = request(t, a, "GET", "/api/v1/projects/"+p.ID, nil, &joined, cookie)
	requireStatus(t, code, 403)
}

func TestPasswordResetRejectsLoginWithPreviouslyVerifiedHash(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	var old []byte
	if err := a.DB.QueryRow(context.Background(), `SELECT password_hash FROM users WHERE id=$1`, s.User.ID).Scan(&old); err != nil {
		t.Fatal(err)
	}
	code, _, _ := request(t, a, "POST", "/api/v1/password/request", wire.EmailRequest{Email: s.User.Email}, nil, nil)
	requireStatus(t, code, 200)
	code, _, _ = request(t, a, "POST", "/api/v1/password/reset", wire.PasswordResetRequest{Token: m.lastCode(), Password: "replacement-password-123"}, nil, nil)
	requireStatus(t, code, 200)
	if _, err := a.createLoginSession(context.Background(), s.User.ID, old); !errors.Is(err, errCredentialsChanged) {
		t.Fatalf("old login survived reset: %v", err)
	}
	code, _, _ = request(t, a, "GET", "/api/v1/session", nil, nil, c)
	requireStatus(t, code, 401)
	var count int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM sessions WHERE user_id=$1`, s.User.ID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("reset raced with old session creation")
	}
}
