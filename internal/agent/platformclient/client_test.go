package platformclient

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestExchangeAndGrantIdentityNotBrowserClaims(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Cookie") != "" || r.Header.Get("Authorization") != "Bearer proof" {
			t.Error("credential separation")
		}
		json.NewEncoder(w).Encode(map[string]any{"data": wire.AgentGrant{Token: "private", UserID: "u", DeviceID: "d", Origin: "https://work.example", ExpiresAt: time.Now().Add(time.Minute).Format(time.RFC3339)}})
	}))
	defer s.Close()
	c, err := New("https://work.example", s.Client())
	if err != nil {
		t.Fatal(err)
	}
	c.BaseURL = s.URL
	g, err := c.Exchange(context.Background(), "proof", "d")
	if err != nil || g.Token != "private" {
		t.Fatalf("%+v %v", g, err)
	}
	if _, err = c.Exchange(context.Background(), "proof", "other"); err == nil {
		t.Fatal("wrong binding")
	}
}
func TestValidateChecksAllBindings(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"data": wire.AgentSession{UserID: "wrong", DeviceID: "d", Origin: "https://work.example", ExpiresAt: time.Now().Add(time.Minute).Format(time.RFC3339)}})
	}))
	defer s.Close()
	c, _ := New("https://work.example", s.Client())
	c.BaseURL = s.URL
	if err := c.Validate(context.Background(), pairing.Grant{Token: "grant", UserID: "u", DeviceID: "d", Origin: c.Origin}); err == nil {
		t.Fatal("wrong user")
	}
}
