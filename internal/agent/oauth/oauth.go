// Package oauth owns native PKCE attempts. Authorization and credential saving are independent.
package oauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mcp-studio/internal/agent/pairing"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Binding struct{ UserID, ProjectID, ConnectionID string }
type Token struct {
	AccessToken string   `json:"accessToken"`
	ExpiresAt   string   `json:"expiresAt"`
	Resource    string   `json:"resource"`
	Issuer      string   `json:"issuer"`
	Scopes      []string `json:"scopes"`
}
type Start struct {
	AttemptID, AuthorizationURL string
	ExpiresAt                   time.Time
}
type State struct {
	AttemptID, Status, Diagnostic string
	Saved                         bool
}
type attempt struct {
	binding                                                       Binding
	state                                                         State
	expires                                                       time.Time
	nonce, verifier, issuer, resource, client, tokenURL, redirect string
	scopes                                                        []string
	token                                                         Token
	server                                                        *http.Server
}
type Manager struct {
	mu       sync.Mutex
	client   *http.Client
	attempts map[string]*attempt
}

func New(client *http.Client) *Manager {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	c := *client
	c.Jar = nil
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("oauth_redirect_rejected") }
	return &Manager{client: &c, attempts: map[string]*attempt{}}
}
func secureURL(raw string) bool {
	u, e := url.Parse(raw)
	return e == nil && u.Scheme == "https" && u.Host != "" && u.User == nil && u.Fragment == "" && u.RawQuery == ""
}
func (m *Manager) read(ctx context.Context, endpoint string, out any) error {
	if !secureURL(endpoint) {
		return errors.New("oauth_endpoint_rejected")
	}
	r, _ := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	resp, err := m.client.Do(r)
	if err != nil {
		return errors.New("oauth_discovery_failed")
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
	if err != nil || len(b) > 1<<20 || resp.StatusCode != 200 || json.Unmarshal(b, out) != nil {
		return errors.New("oauth_discovery_failed")
	}
	return nil
}
func (m *Manager) Start(ctx context.Context, binding Binding, resource, client string, scopes []string) (Start, error) {
	m.mu.Lock()
	for id, a := range m.attempts {
		if time.Now().After(a.expires.Add(5 * time.Minute)) {
			delete(m.attempts, id)
			a.server.Close()
		}
	}
	full := len(m.attempts) >= 64
	m.mu.Unlock()
	if full {
		return Start{}, errors.New("oauth_attempt_limit")
	}
	if !secureURL(resource) || client == "" {
		return Start{}, errors.New("oauth_configuration_invalid")
	}
	u, _ := url.Parse(resource)
	var prm struct {
		Resource string   `json:"resource"`
		Servers  []string `json:"authorization_servers"`
	}
	endpoint := u.Scheme + "://" + u.Host + "/.well-known/oauth-protected-resource" + u.EscapedPath()
	if err := m.read(ctx, endpoint, &prm); err != nil {
		return Start{}, err
	}
	if prm.Resource != resource || len(prm.Servers) != 1 || !secureURL(prm.Servers[0]) {
		return Start{}, errors.New("oauth_resource_binding")
	}
	issuer := prm.Servers[0]
	iu, _ := url.Parse(issuer)
	var metadata struct {
		Issuer    string   `json:"issuer"`
		Auth      string   `json:"authorization_endpoint"`
		Token     string   `json:"token_endpoint"`
		Challenge []string `json:"code_challenge_methods_supported"`
		Scopes    []string `json:"scopes_supported"`
	}
	metadataURL := iu.Scheme + "://" + iu.Host + "/.well-known/oauth-authorization-server" + iu.EscapedPath()
	if err := m.read(ctx, metadataURL, &metadata); err != nil {
		return Start{}, err
	}
	if metadata.Issuer != issuer || !secureURL(metadata.Auth) || !secureURL(metadata.Token) || !includes(metadata.Challenge, "S256") {
		return Start{}, errors.New("oauth_issuer_or_pkce")
	}
	for _, s := range scopes {
		if s == "" || strings.ContainsAny(s, " \r\n\x00") || len(metadata.Scopes) > 0 && !includes(metadata.Scopes, s) {
			return Start{}, errors.New("oauth_scope_rejected")
		}
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return Start{}, errors.New("oauth_callback_unavailable")
	}
	id := pairing.Random()
	a := &attempt{binding: binding, state: State{AttemptID: id, Status: "authorizing"}, expires: time.Now().Add(5 * time.Minute), nonce: pairing.Random(), verifier: pairing.Random(), issuer: issuer, resource: resource, client: client, tokenURL: metadata.Token, redirect: "http://" + listener.Addr().String() + "/oauth/callback", scopes: append([]string{}, scopes...)}
	a.server = &http.Server{ReadHeaderTimeout: 5 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { m.callback(a, w, r) })}
	m.mu.Lock()
	m.attempts[id] = a
	m.mu.Unlock()
	go a.server.Serve(listener)
	go func() {
		timer := time.NewTimer(time.Until(a.expires))
		defer timer.Stop()
		<-timer.C
		m.mu.Lock()
		if a.state.Status == "authorizing" {
			a.state.Status = "expired"
		}
		m.mu.Unlock()
		a.server.Close()
	}()
	sum := sha256.Sum256([]byte(a.verifier))
	auth, _ := url.Parse(metadata.Auth)
	q := auth.Query()
	q.Set("client_id", client)
	q.Set("redirect_uri", a.redirect)
	q.Set("response_type", "code")
	q.Set("state", a.nonce)
	q.Set("code_challenge", base64.RawURLEncoding.EncodeToString(sum[:]))
	q.Set("code_challenge_method", "S256")
	q.Set("resource", resource)
	q.Set("scope", strings.Join(scopes, " "))
	auth.RawQuery = q.Encode()
	return Start{id, auth.String(), a.expires}, nil
}
func includes(values []string, value string) bool {
	for _, v := range values {
		if v == value {
			return true
		}
	}
	return false
}
func (m *Manager) callback(a *attempt, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	u, _ := url.Parse(a.redirect)
	q, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil || r.Method != "GET" || r.Host != u.Host || r.URL.Path != "/oauth/callback" || len(q["state"]) != 1 || q.Get("state") != a.nonce || q.Get("iss") != a.issuer || len(q["iss"]) != 1 {
		http.Error(w, "OAuth callback rejected", 403)
		return
	}
	m.mu.Lock()
	if a.state.Status != "authorizing" || !time.Now().Before(a.expires) {
		m.mu.Unlock()
		http.Error(w, "OAuth callback expired or consumed", 403)
		return
	}
	a.state.Status = "exchanging"
	m.mu.Unlock()
	if q.Get("error") != "" {
		m.mu.Lock()
		a.state.Status = "denied"
		m.mu.Unlock()
		w.Write([]byte("Authorization denied"))
		return
	}
	if q.Get("code") == "" || len(q["code"]) != 1 {
		m.mu.Lock()
		a.state.Status = "callback-failed"
		m.mu.Unlock()
		http.Error(w, "OAuth code missing", 400)
		return
	}
	form := url.Values{"grant_type": {"authorization_code"}, "code": {q.Get("code")}, "client_id": {a.client}, "redirect_uri": {a.redirect}, "code_verifier": {a.verifier}, "resource": {a.resource}}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "POST", a.tokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, requestErr := m.client.Do(req)
	var token struct {
		Access  string  `json:"access_token"`
		Type    string  `json:"token_type"`
		Expires int     `json:"expires_in"`
		Scope   *string `json:"scope"`
	}
	if requestErr == nil {
		b, readErr := io.ReadAll(io.LimitReader(resp.Body, (1<<20)+1))
		resp.Body.Close()
		if readErr != nil || len(b) > 1<<20 || resp.StatusCode != 200 || json.Unmarshal(b, &token) != nil {
			requestErr = errors.New("oauth_exchange_failed")
		}
	}
	if requestErr == nil && (token.Access == "" || !strings.EqualFold(token.Type, "bearer") || token.Expires <= 0) {
		requestErr = errors.New("oauth_token_invalid")
	}
	returned := append([]string{}, a.scopes...)
	if token.Scope != nil {
		returned = strings.Fields(*token.Scope)
	}
	if requestErr == nil {
		for _, scope := range returned {
			if !includes(a.scopes, scope) {
				requestErr = errors.New("oauth_scope_mismatch")
			}
		}
	}
	if requestErr == nil {
		for _, scope := range a.scopes {
			if !includes(returned, scope) {
				requestErr = errors.New("oauth_scope_insufficient")
			}
		}
	}
	m.mu.Lock()
	a.nonce = ""
	a.verifier = ""
	if requestErr != nil {
		a.state.Status = "callback-failed"
		a.state.Diagnostic = "oauth_exchange_failed"
		if requestErr.Error() == "oauth_scope_insufficient" {
			a.state.Status = "denied"
			a.state.Diagnostic = "oauth_scope_insufficient"
		}
		if requestErr.Error() == "oauth_scope_mismatch" {
			a.state.Diagnostic = "oauth_scope_mismatch"
		}
	} else {
		a.state.Status = "authorized"
		a.token = Token{token.Access, time.Now().Add(time.Duration(token.Expires) * time.Second).UTC().Format(time.RFC3339), a.resource, a.issuer, append([]string{}, returned...)}
	}
	m.mu.Unlock()
	if requestErr != nil {
		w.Write([]byte("Authorization failed or required scopes were not granted. Return to the workbench for details."))
		return
	}
	w.Write([]byte("Authorization completed. Return to the workbench to save credentials and connect."))
}
func (m *Manager) State(id string, b Binding) (State, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a := m.attempts[id]
	if a == nil || a.binding != b {
		return State{}, errors.New("not_found")
	}
	if a.state.Status == "authorized" {
		expiry, _ := time.Parse(time.RFC3339, a.token.ExpiresAt)
		if !time.Now().Before(expiry) {
			a.state.Status = "expired"
		}
	}
	return a.state, nil
}
func (m *Manager) Save(ctx context.Context, id string, b Binding, save func(Token) error) error {
	m.mu.Lock()
	a := m.attempts[id]
	if a == nil || a.binding != b || a.state.Status != "authorized" {
		m.mu.Unlock()
		return errors.New("oauth_not_authorized")
	}
	token := a.token
	m.mu.Unlock()
	expiry, err := time.Parse(time.RFC3339, token.ExpiresAt)
	if err != nil || !time.Now().Before(expiry) {
		return errors.New("oauth_expired")
	}
	if err = save(token); err != nil {
		m.mu.Lock()
		a.state.Diagnostic = "credential_save_failed"
		m.mu.Unlock()
		return err
	}
	m.mu.Lock()
	a.state.Saved = true
	a.state.Diagnostic = ""
	m.mu.Unlock()
	return nil
}
