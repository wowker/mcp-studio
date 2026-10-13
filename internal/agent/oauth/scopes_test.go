package oauth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"
	"time"
)

func TestOAuthReducedScopeIsDeniedAndCannotBeSaved(t *testing.T) {
	scope := "read"
	exerciseScopes(t, &scope, true, nil)
}
func TestOAuthOmittedScopeUsesRequestedAndProvidedScopeUsesActual(t *testing.T) {
	exerciseScopes(t, nil, false, []string{"read", "write"})
	scope := "write read"
	exerciseScopes(t, &scope, false, []string{"write", "read"})
	empty := ""
	exerciseScopes(t, &empty, true, nil)
}
func exerciseScopes(t *testing.T, returned *string, denied bool, want []string) {
	t.Helper()
	var base string
	as := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/.well-known/oauth-protected-resource/mcp":
			json.NewEncoder(w).Encode(map[string]any{"resource": base + "/mcp", "authorization_servers": []string{base}})
		case "/.well-known/oauth-authorization-server":
			json.NewEncoder(w).Encode(map[string]any{"issuer": base, "authorization_endpoint": base + "/authorize", "token_endpoint": base + "/token", "code_challenge_methods_supported": []string{"S256"}, "scopes_supported": []string{"read", "write"}})
		case "/token":
			v := map[string]any{"access_token": "secret", "token_type": "Bearer", "expires_in": 300}
			if returned != nil {
				v["scope"] = *returned
			}
			json.NewEncoder(w).Encode(v)
		}
	}))
	defer as.Close()
	base = as.URL
	m := New(as.Client())
	binding := Binding{UserID: "u", ProjectID: "p", ConnectionID: "c"}
	start, err := m.Start(context.Background(), binding, base+"/mcp", "client", []string{"read", "write"})
	if err != nil {
		t.Fatal(err)
	}
	authorization, _ := url.Parse(start.AuthorizationURL)
	callback := authorization.Query().Get("redirect_uri") + "?code=c&state=" + authorization.Query().Get("state") + "&iss=" + url.QueryEscape(base)
	res, err := http.Get(callback)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	var state State
	for i := 0; i < 50; i++ {
		state, _ = m.State(start.AttemptID, binding)
		if state.Status != "authorizing" && state.Status != "exchanging" {
			break
		}
		time.Sleep(time.Millisecond * 5)
	}
	saved := false
	err = m.Save(context.Background(), start.AttemptID, binding, func(token Token) error {
		saved = true
		if !reflect.DeepEqual(token.Scopes, want) {
			t.Errorf("claimed scopes %v want actual %v", token.Scopes, want)
		}
		return nil
	})
	if denied {
		if state.Status != "denied" || state.Diagnostic != "oauth_scope_insufficient" || err == nil || saved {
			t.Fatalf("reduced scope accepted: %+v saved=%v err=%v", state, saved, err)
		}
	} else if state.Status != "authorized" || err != nil || !saved {
		t.Fatal(state, saved, err)
	}
}
