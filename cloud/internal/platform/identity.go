package platform

import (
	"context"
	"crypto/subtle"
	"errors"
	"golang.org/x/crypto/bcrypt"
	"mcp-studio/internal/wire"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

func validEmail(s string) bool {
	a, e := mail.ParseAddress(s)
	return e == nil && a.Address == s && len(s) <= 254 && !strings.ContainsAny(s, "\r\n")
}
func passwordHash(s string) ([]byte, error) {
	if len(s) < 12 || len(s) > 72 {
		return nil, errors.New("password policy")
	}
	return bcrypt.GenerateFromPassword([]byte(s), 12)
}
func (a *App) identityRoutes(m *http.ServeMux) {
	m.HandleFunc("GET /api/v1/bootstrap", func(w http.ResponseWriter, r *http.Request) {
		var initialized bool
		if err := a.DB.QueryRow(r.Context(), `SELECT initialized FROM bootstrap WHERE singleton`).Scan(&initialized); err != nil {
			fail(w, 503, "database_unavailable")
			return
		}
		success(w, wire.Bootstrap{Initialized: initialized, MailConfigured: a.Mail != nil})
	})
	m.HandleFunc("POST /api/v1/initialize", a.initialize)
	m.HandleFunc("POST /api/v1/login", a.login)
	m.HandleFunc("GET /api/v1/session", func(w http.ResponseWriter, r *http.Request) {
		s, err := a.session(r)
		if err != nil {
			a.cookie(w, "", true)
			fail(w, 401, "session_expired")
			return
		}
		success(w, s)
	})
	m.HandleFunc("POST /api/v1/logout", func(w http.ResponseWriter, r *http.Request) {
		if _, ok := a.require(w, r, false); !ok {
			return
		}
		c, _ := r.Cookie(a.cookieName())
		if _, err := a.DB.Exec(r.Context(), `DELETE FROM sessions WHERE digest=$1`, digest(c.Value)); err != nil {
			fail(w, 503, "database_unavailable")
			return
		}
		a.cookie(w, "", true)
		success(w, wire.Accepted{Ok: true})
	})
	m.HandleFunc("POST /api/v1/verification/request", func(w http.ResponseWriter, r *http.Request) {
		u, ok := a.require(w, r, false)
		if !ok {
			return
		}
		if err := a.emailToken(r.Context(), u.ID, u.Email, "verify"); err != nil {
			fail(w, 503, "mail_unavailable")
			return
		}
		success(w, wire.Accepted{Ok: true})
	})
	m.HandleFunc("POST /api/v1/verification/confirm", func(w http.ResponseWriter, r *http.Request) {
		if !a.throttle(r) {
			fail(w, 429, "rate_limited")
			return
		}
		var x wire.TokenRequest
		if !decode(w, r, &x) {
			return
		}
		if err := a.consume(r.Context(), x.Token, "verify", nil); err != nil {
			fail(w, 400, "invalid_token")
			return
		}
		success(w, wire.Accepted{Ok: true})
	})
	m.HandleFunc("POST /api/v1/password/request", a.resetRequest)
	m.HandleFunc("POST /api/v1/password/reset", func(w http.ResponseWriter, r *http.Request) {
		if !a.throttle(r) {
			fail(w, 429, "rate_limited")
			return
		}
		var x wire.PasswordResetRequest
		if !decode(w, r, &x) {
			return
		}
		hash, err := passwordHash(x.Password)
		if err != nil {
			fail(w, 400, "password_policy")
			return
		}
		if err = a.consume(r.Context(), x.Token, "reset", hash); err != nil {
			fail(w, 400, "invalid_token")
			return
		}
		success(w, wire.Accepted{Ok: true})
	})
	m.HandleFunc("POST /api/v1/invitation/register", a.register)
}
func (a *App) initialize(w http.ResponseWriter, r *http.Request) {
	if !a.throttle(r) {
		fail(w, 429, "rate_limited")
		return
	}
	var x wire.InitializeRequest
	if !decode(w, r, &x) {
		return
	}
	if a.Config.BootstrapCredential == "" || subtle.ConstantTimeCompare([]byte(x.Credential), []byte(a.Config.BootstrapCredential)) != 1 {
		fail(w, 403, "invalid_credential")
		return
	}
	x.Email = canonical(x.Email)
	if !validEmail(x.Email) || strings.TrimSpace(x.Name) == "" || strings.TrimSpace(x.TeamName) == "" || len(x.Name) > 200 || len(x.TeamName) > 200 {
		fail(w, 400, "invalid_input")
		return
	}
	hash, err := passwordHash(x.Password)
	if err != nil {
		fail(w, 400, "password_policy")
		return
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		fail(w, 503, "database_unavailable")
		return
	}
	defer tx.Rollback(ctx)
	var initialized bool
	if err = tx.QueryRow(ctx, `SELECT initialized FROM bootstrap WHERE singleton FOR UPDATE`).Scan(&initialized); err != nil {
		fail(w, 503, "database_unavailable")
		return
	}
	if initialized {
		fail(w, 409, "already_initialized")
		return
	}
	uid, tid := id(), id()
	if _, err = tx.Exec(ctx, `INSERT INTO users VALUES($1,$2,$3,$4,false)`, uid, x.Email, strings.TrimSpace(x.Name), hash); err == nil {
		_, err = tx.Exec(ctx, `INSERT INTO teams VALUES($1,$2)`, tid, strings.TrimSpace(x.TeamName))
	}
	if err == nil {
		_, err = tx.Exec(ctx, `INSERT INTO team_members VALUES($1,$2,'owner')`, tid, uid)
	}
	if err == nil {
		_, err = tx.Exec(ctx, `UPDATE bootstrap SET initialized=true WHERE singleton`)
	}
	if err == nil {
		err = tx.Commit(ctx)
	}
	if err != nil {
		fail(w, 409, "initialization_conflict")
		return
	}
	success(w, wire.Accepted{Ok: true})
}
func (a *App) login(w http.ResponseWriter, r *http.Request) {
	if !a.throttle(r) {
		fail(w, 429, "rate_limited")
		return
	}
	var x wire.LoginRequest
	if !decode(w, r, &x) {
		return
	}
	var uid string
	var hash []byte
	err := a.DB.QueryRow(r.Context(), `SELECT id,password_hash FROM users WHERE email=$1`, canonical(x.Email)).Scan(&uid, &hash)
	if err != nil {
		hash = []byte("$2a$12$C6UzMDM.H6dfI/f/IKcEe.NmJKlEmmzRgIQNPauTukZjI1gyiwBuK")
	}
	match := bcrypt.CompareHashAndPassword(hash, []byte(x.Password))
	if err != nil || match != nil {
		fail(w, 401, "invalid_login")
		return
	}
	raw, err := a.createLoginSession(r.Context(), uid, hash)
	if errors.Is(err, errCredentialsChanged) {
		fail(w, 401, "invalid_login")
		return
	}
	if err != nil {
		fail(w, 503, "database_unavailable")
		return
	}
	r.Header.Del("Cookie")
	r.AddCookie(&http.Cookie{Name: a.cookieName(), Value: raw})
	s, err := a.session(r)
	if err != nil {
		fail(w, 503, "database_unavailable")
		return
	}
	a.cookie(w, raw, false)
	success(w, s)
}

var errCredentialsChanged = errors.New("credentials changed")

// Serialize session creation with password reset, then recheck the hash verified
// before bcrypt work. A completed reset cannot be followed by an old login.
func (a *App) createLoginSession(ctx context.Context, uid string, verifiedHash []byte) (string, error) {
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	var current []byte
	if err = tx.QueryRow(ctx, `SELECT password_hash FROM users WHERE id=$1 FOR UPDATE`, uid).Scan(&current); err != nil {
		return "", err
	}
	if subtle.ConstantTimeCompare(current, verifiedHash) != 1 {
		return "", errCredentialsChanged
	}
	raw, csrf := token(), token()
	now := a.Now()
	if _, err = tx.Exec(ctx, `INSERT INTO sessions VALUES($1,$2,$3,$4,$4)`, digest(raw), uid, csrf, now); err != nil {
		return "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", err
	}
	return raw, nil
}

func (a *App) emailToken(ctx context.Context, uid, email, kind string) error {
	if a.Mail == nil {
		return errors.New("mail disabled")
	}
	raw := token()
	expires := a.Now().Add(30 * time.Minute)
	if _, err := a.DB.Exec(ctx, `INSERT INTO email_tokens VALUES($1,$2,$3,$4,false)`, digest(raw), uid, kind, expires); err != nil {
		return err
	}
	subject := "MCP Studio email verification"
	if kind == "reset" {
		subject = "MCP Studio password reset"
	}
	err := a.Mail.Send(ctx, email, subject, "Enter this one-time code in MCP Studio. It expires in 30 minutes.\n"+raw)
	if err != nil {
		a.DB.Exec(ctx, `DELETE FROM email_tokens WHERE digest=$1`, digest(raw))
	}
	return err
}
func (a *App) consume(ctx context.Context, raw, kind string, hash []byte) error {
	if len(raw) != 64 {
		return errors.New("invalid")
	}
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var uid string
	var expires time.Time
	var used bool
	err = tx.QueryRow(ctx, `SELECT user_id,expires_at,used FROM email_tokens WHERE digest=$1 AND kind=$2 FOR UPDATE`, digest(raw), kind).Scan(&uid, &expires, &used)
	if err != nil || used || !a.Now().Before(expires) {
		return errors.New("invalid")
	}
	if kind == "verify" {
		_, err = tx.Exec(ctx, `UPDATE users SET verified=true WHERE id=$1`, uid)
	} else {
		_, err = tx.Exec(ctx, `UPDATE users SET password_hash=$1 WHERE id=$2`, hash, uid)
		if err == nil {
			_, err = tx.Exec(ctx, `DELETE FROM sessions WHERE user_id=$1`, uid)
		}
	}
	if err == nil {
		_, err = tx.Exec(ctx, `UPDATE email_tokens SET used=true WHERE digest=$1 OR (user_id=$2 AND kind=$3)`, digest(raw), uid, kind)
	}
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
func (a *App) resetRequest(w http.ResponseWriter, r *http.Request) {
	if !a.throttle(r) {
		fail(w, 429, "rate_limited")
		return
	}
	var x wire.EmailRequest
	if !decode(w, r, &x) {
		return
	}
	if a.Mail == nil {
		fail(w, 503, "mail_unavailable")
		return
	}
	var uid, email string
	err := a.DB.QueryRow(r.Context(), `SELECT id,email FROM users WHERE email=$1`, canonical(x.Email)).Scan(&uid, &email)
	if err == nil {
		_ = a.emailToken(r.Context(), uid, email, "reset")
	}
	success(w, wire.Accepted{Ok: true})
}
func (a *App) register(w http.ResponseWriter, r *http.Request) {
	if !a.throttle(r) {
		fail(w, 429, "rate_limited")
		return
	}
	var x wire.RegisterRequest
	if !decode(w, r, &x) {
		return
	}
	x.Email = canonical(x.Email)
	if !validEmail(x.Email) || strings.TrimSpace(x.Name) == "" || len(x.Name) > 200 || len(x.Token) != 64 {
		fail(w, 400, "invalid_input")
		return
	}
	hash, err := passwordHash(x.Password)
	if err != nil {
		fail(w, 400, "password_policy")
		return
	}
	if a.Mail == nil {
		fail(w, 503, "mail_unavailable")
		return
	}
	ctx := r.Context()
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		fail(w, 503, "database_unavailable")
		return
	}
	defer tx.Rollback(ctx)
	var projectID, teamID, inviter, teamRole, projectRole, email string
	var expires time.Time
	err = tx.QueryRow(ctx, `SELECT i.project_id,p.team_id,i.created_by,i.team_role,i.project_role,i.email,i.expires_at FROM invitations i JOIN projects p ON p.id=i.project_id WHERE i.digest=$1 AND i.status='pending'`, digest(x.Token)).Scan(&projectID, &teamID, &inviter, &teamRole, &projectRole, &email, &expires)
	if err != nil || email != x.Email || !a.Now().Before(expires) {
		fail(w, 400, "invalid_invitation")
		return
	}
	var lock string
	if err = tx.QueryRow(ctx, `SELECT id FROM teams WHERE id=$1 FOR UPDATE`, teamID).Scan(&lock); err != nil {
		fail(w, 400, "invalid_invitation")
		return
	}
	// Re-read under the same team lock used by revoke/resend/accept and role changes.
	var valid bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM invitations WHERE digest=$1 AND status='pending' AND expires_at>$2)`, digest(x.Token), a.Now()).Scan(&valid)
	if err != nil || !valid || !authorizedInvite(ctx, tx, projectID, inviter, teamRole) {
		fail(w, 400, "invalid_invitation")
		return
	}

	uid := id()
	if _, err = tx.Exec(ctx, `INSERT INTO users VALUES($1,$2,$3,$4,false)`, uid, x.Email, strings.TrimSpace(x.Name), hash); err != nil {
		fail(w, 409, "account_exists")
		return
	}
	if err = tx.Commit(ctx); err != nil {
		fail(w, 503, "database_unavailable")
		return
	}
	if err = a.emailToken(ctx, uid, x.Email, "verify"); err != nil {
		fail(w, 503, "mail_unavailable")
		return
	}
	success(w, wire.Accepted{Ok: true})
}
