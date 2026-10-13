package sessions

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/vault"
	"mcp-studio/internal/wire"
	"net/http/httptest"
	"strings"
	"testing"
)

type memoryKeys struct{ key []byte }

func (k *memoryKeys) Read(context.Context, string) ([]byte, error) {
	if k.key == nil {
		return nil, vault.ErrKeyMissing
	}
	return append([]byte{}, k.key...), nil
}
func (k *memoryKeys) Create(_ context.Context, _ string, b []byte) error {
	k.key = append([]byte{}, b...)
	return nil
}
func (k *memoryKeys) Delete(context.Context, string) error { k.key = nil; return nil }
func (a *authority) Current(ctx context.Context, g pairing.Grant, pid, cid string) (platformclient.Authorized, error) {
	return a.Authorize(ctx, g, platformclient.ConnectionRequest{}, "")
}
func TestCredentialRevealRequiresCurrentProjectAuthorityAndExplicitChoice(t *testing.T) {
	store, err := vault.NewStore(t.TempDir(), "device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	a := &authority{}
	e := New(Config{Platform: a, Vault: store})
	s := pairing.Session{UserID: "u", Grant: pairing.Grant{UserID: "u"}}
	store.Save(context.Background(), vault.Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "token"}, vault.Value{ValueJSON: `"private-token"`}, "session")
	body := `{"projectId":"p","connectionId":"c","kind":"token","referenceId":"","confirmed":true}`
	for _, deny := range []bool{false, true} {
		a.denied.Store(deny)
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "http://127.0.0.1/v1/credentials/reveal", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		e.ServeAuthenticated(w, r, s)
		if !deny {
			var v map[string]any
			json.Unmarshal(w.Body.Bytes(), &v)
			if !strings.Contains(w.Body.String(), "private-token") {
				t.Fatal(w.Body.String())
			}
		} else if strings.Contains(w.Body.String(), "private-token") || w.Code == 200 {
			t.Fatal("revoked access exposed secret")
		}
	}
}
func TestTokenSaveRejectsNonStringAndEmptyValues(t *testing.T) {
	store, err := vault.NewStore(t.TempDir(), "device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	e := New(Config{Platform: &authority{}, Vault: store})
	for _, value := range []string{`0`, `""`, `"line\nbreak"`} {
		body := `{"projectId":"p","connectionId":"c","kind":"token","referenceId":"","valueJSON":` + stringValue(value) + `,"retention":"session"}`
		r := httptest.NewRequest("POST", "http://127.0.0.1/v1/credentials", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		e.ServeAuthenticated(w, r, pairing.Session{UserID: "u", Grant: pairing.Grant{UserID: "u"}})
		if w.Code == 200 {
			t.Fatal("invalid token saved", value)
		}
	}
}
func stringValue(s string) string { b, _ := json.Marshal(s); return string(b) }
func TestResolvedEndpointRejectsEncodedKnownCredential(t *testing.T) {
	store, err := vault.NewStore(t.TempDir(), "device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	store.Save(context.Background(), vault.Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "token"}, vault.Value{ValueJSON: `"a/b"`}, "session")
	e := New(Config{Vault: store})
	s := pairing.Session{UserID: "u", Grant: pairing.Grant{UserID: "u"}}
	for _, endpoint := range []string{"https://mcp.example/?public=a%2Fb", "https://mcp.example/path/a%2Fb"} {
		a := platformclient.Authorized{Connection: wire.Connection{ID: "c", ProjectID: "p", Name: "fixture", Version: 1, Channel: "agent", Transport: "streamable-http", Endpoint: endpoint, AuthMode: "token", Args: []string{}, Env: []wire.ConfigEntry{}, Headers: []wire.ConfigEntry{}, OauthScopes: []string{}, TimeoutMs: 1000}}
		if _, _, err = e.resolve(context.Background(), s, a); err == nil {
			t.Fatal("encoded credential URL accepted", endpoint)
		}
	}
}
func TestLocalCredentialRoundtripDoesNotMutateMasterKeyProvider(t *testing.T) {
	keys := &memoryKeys{}
	root := t.TempDir()
	scope := vault.Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "token"}
	store, err := vault.NewStore(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	if err = store.Save(context.Background(), scope, vault.Value{ValueJSON: `"roundtrip-token"`}, "local"); err != nil {
		t.Fatal(err)
	}
	store.Close()
	reopened, err := vault.NewStore(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	for i := 0; i < 2; i++ {
		value, err := reopened.Get(context.Background(), scope)
		if err != nil || value.ValueJSON != `"roundtrip-token"` {
			t.Fatalf("local roundtrip read %d: %v", i, err)
		}
	}
}
