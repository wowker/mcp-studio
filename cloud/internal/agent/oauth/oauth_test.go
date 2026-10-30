package oauth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync/atomic"
	"testing"
	"time"
)

func TestPKCEStateResourceAndSaveFailureDoesNotExchangeAgain(t *testing.T) {
	var exchanges atomic.Int32
	var base string
	as := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/oauth-protected-resource/mcp":
			json.NewEncoder(w).Encode(map[string]any{"resource": base + "/mcp", "authorization_servers": []string{base}})
		case "/.well-known/oauth-authorization-server":
			json.NewEncoder(w).Encode(map[string]any{"issuer": base, "authorization_endpoint": base + "/authorize", "token_endpoint": base + "/token", "code_challenge_methods_supported": []string{"S256"}, "scopes_supported": []string{"read"}})
		case "/token":
			r.ParseForm()
			if r.Form.Get("resource") != base+"/mcp" || r.Form.Get("code_verifier") == "" {
				t.Error("resource or PKCE absent")
			}
			exchanges.Add(1)
			json.NewEncoder(w).Encode(map[string]any{"access_token": "oauth-secret", "token_type": "Bearer", "expires_in": 300, "scope": "read"})
		}
	}))
	defer as.Close()
	base = as.URL
	m := New(as.Client())
	start, err := m.Start(context.Background(), Binding{UserID: "u", ProjectID: "p", ConnectionID: "c"}, base+"/mcp", "client", []string{"read"})
	if err != nil {
		t.Fatal(err)
	}
	authorization, _ := url.Parse(start.AuthorizationURL)
	if authorization.Query().Get("code_challenge_method") != "S256" {
		t.Fatal("pkce")
	}
	callback := authorization.Query().Get("redirect_uri")
	bad := callback + "?code=c&state=wrong&iss=" + url.QueryEscape(base)
	res, err := http.Get(bad)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode == 200 {
		t.Fatal("wrong state")
	}
	wrongIssuer := callback + "?code=c&state=" + authorization.Query().Get("state") + "&iss=" + url.QueryEscape("https://wrong.example")
	res, err = http.Get(wrongIssuer)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode == 200 || exchanges.Load() != 0 {
		t.Fatal("wrong issuer reached token exchange")
	}
	good := callback + "?code=c&state=" + authorization.Query().Get("state") + "&iss=" + url.QueryEscape(base)
	res, err = http.Get(good)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	for i := 0; i < 50; i++ {
		state, _ := m.State(start.AttemptID, Binding{UserID: "u", ProjectID: "p", ConnectionID: "c"})
		if state.Status == "authorized" {
			break
		}
		time.Sleep(time.Millisecond * 10)
	}
	if exchanges.Load() != 1 {
		t.Fatal(exchanges.Load())
	}
	res, err = http.Get(good)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode == 200 || exchanges.Load() != 1 {
		t.Fatal("authorization code callback replay")
	}
	if err = m.Save(context.Background(), start.AttemptID, Binding{UserID: "u", ProjectID: "p", ConnectionID: "c"}, func(Token) error { return context.Canceled }); err == nil {
		t.Fatal("save failed not exposed")
	}
	if err = m.Save(context.Background(), start.AttemptID, Binding{UserID: "u", ProjectID: "p", ConnectionID: "c"}, func(Token) error { return nil }); err != nil {
		t.Fatal(err)
	}
	if exchanges.Load() != 1 {
		t.Fatal("save repeated exchange")
	}
}
