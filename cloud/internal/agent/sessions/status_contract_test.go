package sessions

import (
	"bytes"
	"context"
	"encoding/json"
	"mcp-studio/internal/agent/localapi"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/vault"
	agentwire "mcp-studio/internal/agent/wire"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

type proofAuthority struct{ authority }

func (a *proofAuthority) Exchange(_ context.Context, _ string, device string) (pairing.Grant, error) {
	return pairing.Grant{Token: "private-platform-grant", UserID: "u", DeviceID: device, Origin: "https://work.example", ExpiresAt: time.Now().Add(time.Hour)}, nil
}
func (a *proofAuthority) Validate(context.Context, pairing.Grant) error { return nil }
func TestRealLocalAPICredentialStatusUsesContractEnum(t *testing.T) {
	raw, err := os.ReadFile("../../../contracts/agent/openapi.json")
	if err != nil {
		t.Fatal(err)
	}
	var contract struct {
		Components struct {
			Schemas map[string]struct {
				Required   []string `json:"required"`
				Properties map[string]struct {
					Enum []string `json:"enum"`
				} `json:"properties"`
			} `json:"schemas"`
		} `json:"components"`
	}
	if json.Unmarshal(raw, &contract) != nil {
		t.Fatal("invalid contract")
	}
	definition := contract.Components.Schemas["AgentCredentialState"]
	store, err := vault.NewStore(t.TempDir(), "device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	platform := &proofAuthority{}
	engine := New(Config{Platform: platform, Vault: store})
	defer engine.Close()
	var api *localapi.API
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { api.ServeHTTP(w, r) }))
	defer server.Close()
	prompts := make(chan pairing.Prompt, 1)
	api, err = localapi.New(localapi.Config{Origin: "https://work.example", Host: strings.TrimPrefix(server.URL, "http://"), DeviceID: "device", Platform: platform, Engine: engine, Confirm: func(_ context.Context, p pairing.Prompt) (bool, error) { prompts <- p; return true, nil }})
	if err != nil {
		t.Fatal(err)
	}
	send := func(path, body, bearer string) map[string]any {
		r, _ := http.NewRequest("POST", server.URL+path, bytes.NewBufferString(body))
		r.Header.Set("Origin", "https://work.example")
		r.Header.Set("Content-Type", "application/json")
		if bearer != "" {
			r.Header.Set("Authorization", "Bearer "+bearer)
		}
		res, err := server.Client().Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		var response struct {
			Data map[string]any `json:"data"`
		}
		if json.NewDecoder(res.Body).Decode(&response) != nil || res.StatusCode < 200 || res.StatusCode >= 300 {
			t.Fatal("localAPI request failed", res.StatusCode, path)
		}
		return response.Data
	}
	ch := send("/v1/pairing/challenges", `{"platformProof":"proof","deviceId":"device","contractVersion":"1.0.0"}`, "")
	prompt := <-prompts
	time.Sleep(time.Millisecond * 10)
	input, _ := json.Marshal(agentwire.AgentPairInput{ChallengeID: ch["challengeId"].(string), Code: prompt.Code})
	pair := send("/v1/pairing/confirmations", string(input), "")
	channel := pair["channelToken"].(string)
	check := func(want string) {
		data := send("/v1/credentials/status", `{"projectId":"p","connectionId":"c","kind":"token","referenceId":""}`, channel)
		status, _ := data["status"].(string)
		accepted := false
		for _, allowed := range definition.Properties["status"].Enum {
			if allowed == status {
				accepted = true
			}
		}
		if !accepted || status != want {
			t.Fatalf("actual localAPI status %q wanted %q outside enum %v", status, want, definition.Properties["status"].Enum)
		}
		for _, field := range definition.Required {
			if _, exists := data[field]; !exists {
				t.Fatal("missing contract field", field)
			}
		}
		encoded, _ := json.Marshal(data)
		if strings.Contains(string(encoded), "private-platform-grant") || strings.Contains(string(encoded), "actual-local-token") {
			t.Fatal("credential status leaked secret")
		}
	}
	check("missing")
	send("/v1/credentials", `{"projectId":"p","connectionId":"c","kind":"token","referenceId":"","valueJSON":"\"actual-local-token\"","retention":"session"}`, channel)
	check("saved")
	now := time.Now()
	store.Save(context.Background(), vault.Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "token"}, vault.Value{ValueJSON: `"actual-local-token"`, ExpiresAt: now.Add(time.Minute).Format(time.RFC3339)}, "session")
	store.Now = func() time.Time { return now.Add(2 * time.Minute) }
	check("expired")
}
