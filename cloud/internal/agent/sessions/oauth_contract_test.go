package sessions

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/agent/oauth"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/vault"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestOAuthSaveReturnsCredentialStateAndKeepsAuthorizationStateSeparate(t *testing.T) {
	var base string
	as := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/oauth-protected-resource/mcp":
			json.NewEncoder(w).Encode(map[string]any{"resource": base + "/mcp", "authorization_servers": []string{base}})
		case "/.well-known/oauth-authorization-server":
			json.NewEncoder(w).Encode(map[string]any{"issuer": base, "authorization_endpoint": base + "/authorize", "token_endpoint": base + "/token", "code_challenge_methods_supported": []string{"S256"}, "scopes_supported": []string{"read"}})
		case "/token":
			json.NewEncoder(w).Encode(map[string]any{"access_token": "private-oauth-token", "token_type": "Bearer", "expires_in": 300, "scope": "read"})
		}
	}))
	defer as.Close()
	base = as.URL
	store, err := vault.NewStore(t.TempDir(), "device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	e := New(Config{Platform: &authority{a: platformclient.Authorized{Connection: wire.Connection{ID: "c", ProjectID: "p", Version: 1, Channel: "agent", AuthMode: "oauth", Endpoint: base + "/mcp", OauthClientID: "client", OauthScopes: []string{"read"}}}}, Vault: store, OAuth: oauth.New(as.Client())})
	defer e.Close()
	s := pairing.Session{UserID: "u", Grant: pairing.Grant{UserID: "u"}}
	send := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		e.ServeAuthenticated(w, r, s)
		return w
	}
	w := send("POST", "/v1/oauth", `{"projectId":"p","connectionId":"c","version":1,"environmentId":""}`)
	var start struct {
		Data agentwire.AgentOAuthStart `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &start)
	if w.Code != 201 {
		t.Fatal(w.Body.String())
	}
	u, _ := url.Parse(start.Data.AuthorizationUrl)
	res, err := http.Get(u.Query().Get("redirect_uri") + "?code=c&state=" + u.Query().Get("state") + "&iss=" + url.QueryEscape(base))
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	for i := 0; i < 50; i++ {
		state, _ := e.config.OAuth.State(start.Data.AttemptID, oauth.Binding{UserID: "u", ProjectID: "p", ConnectionID: "c"})
		if state.Status == "authorized" {
			break
		}
		time.Sleep(time.Millisecond * 5)
	}
	w = send("POST", "/v1/oauth/"+start.Data.AttemptID+"/save", `{"retention":"session"}`)
	var saved struct {
		Data agentwire.AgentCredentialState `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &saved)
	if w.Code != 200 || !saved.Data.Present || saved.Data.Kind != "oauth" || saved.Data.Location != "session" || saved.Data.Status != "saved" || saved.Data.ExpiresAt == "" || strings.Contains(w.Body.String(), "private-oauth-token") {
		t.Fatal("save credential contract", w.Code, w.Body.String())
	}
	w = send("GET", "/v1/oauth/"+start.Data.AttemptID, "")
	var state struct {
		Data agentwire.AgentOAuthState `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &state)
	if state.Data.Status != "authorized" || !state.Data.Saved {
		t.Fatal("authorization state changed", w.Body.String())
	}
	value, err := store.Get(context.Background(), vault.Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "oauth"})
	if err != nil || !strings.Contains(value.ValueJSON, "private-oauth-token") {
		t.Fatal("credential not saved")
	}
}
