package sessions

import (
	"context"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/vault"
	"mcp-studio/internal/wire"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAgentPreviewUsesItsOwnVaultAndMasksDerivedSecrets(t *testing.T) {
	store, err := vault.NewStore(t.TempDir(), "device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	a := &authority{a: platformclient.Authorized{Connection: wire.Connection{ProjectID: "p", ID: "c"}, Variables: []wire.Variable{{ID: "secret", ProjectID: "p", ConnectionID: "c", Name: "SECRET", Type: "string", Sensitive: true, Required: true}, {ID: "derived", ProjectID: "p", ConnectionID: "c", Name: "DERIVED", Type: "string", ValueJSON: `"prefix-{{SECRET}}"`}}}}
	store.Save(context.Background(), vault.Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "variable", ReferenceID: "secret"}, vault.Value{ValueJSON: `"local-only"`}, "session")
	e := New(Config{Platform: a, Vault: store})
	r := httptest.NewRequest("POST", "http://127.0.0.1/v1/environment/preview", strings.NewReader(`{"projectId":"p","connectionId":"c","version":1,"environmentId":""}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	e.ServeAuthenticated(w, r, pairing.Session{UserID: "u", Grant: pairing.Grant{UserID: "u"}})
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"valid":true`) || strings.Contains(w.Body.String(), "local-only") {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestOverriddenMissingOrExpiredCredentialDoesNotBlockEffectiveLayer(t *testing.T) {
	store, err := vault.NewStore(t.TempDir(), "device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	clock := time.Now()
	store.Now = func() time.Time { return clock }
	store.Save(context.Background(), vault.Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "variable", ReferenceID: "old"}, vault.Value{ValueJSON: `"old-secret"`, ExpiresAt: clock.Add(time.Minute).Format(time.RFC3339)}, "session")
	clock = clock.Add(2 * time.Minute)
	a := platformclient.Authorized{Connection: wire.Connection{ProjectID: "p", ID: "c", AuthMode: "none"}, Variables: []wire.Variable{{ID: "old", ProjectID: "p", Name: "VALUE", Type: "string", Sensitive: true}, {ID: "current", ProjectID: "p", ConnectionID: "c", Name: "VALUE", Type: "string", ValueJSON: `"public"`}}}
	if _, _, _, err := (storeValues{store}).Resolve(context.Background(), pairing.Grant{UserID: "u"}, a); err != nil {
		t.Fatal("overridden secret used", err)
	}
}
