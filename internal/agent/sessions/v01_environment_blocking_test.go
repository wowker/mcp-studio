package sessions

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/vault"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/wire"
)

// Real resolution, vault, SDK and upstream; authority only supplies the scoped
// platform response. This case does not claim a new authorization acceptance.
func TestV01AgentDependencyErrorsBlockConnectAndRun(t *testing.T) {
	for _, entry := range []struct{ name, value string }{
		{"cycle", `"{{CYCLE}}"`},
		{"nested missing dependency", `{"deep":["{{MISSING}}"]}`},
	} {
		t.Run(entry.name, func(t *testing.T) {
			ctx := context.Background()
			var requests, calls atomic.Int32
			server := sdk.NewServer(&sdk.Implementation{Name: "Dependency fixture", Version: "1"}, nil)
			server.AddTool(&sdk.Tool{Name: "echo", InputSchema: map[string]any{"type": "object"}}, func(context.Context, *sdk.CallToolRequest) (*sdk.CallToolResult, error) {
				calls.Add(1)
				return &sdk.CallToolResult{Content: []sdk.Content{&sdk.TextContent{Text: "repaired"}}}, nil
			})
			handler := sdk.NewStreamableHTTPHandler(func(*http.Request) *sdk.Server { return server }, nil)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests.Add(1); handler.ServeHTTP(w, r) }))
			defer upstream.Close()
			store, err := vault.NewStore(t.TempDir(), "device", &memoryKeys{})
			if err != nil {
				t.Fatal(err)
			}
			defer store.Close()
			scope := vault.Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "variable", ReferenceID: "private"}
			save := func(value string) {
				t.Helper()
				if err := store.Save(ctx, scope, vault.Value{ValueJSON: value}, "session"); err != nil {
					t.Fatal(err)
				}
			}
			connection := wire.Connection{ID: "c", ProjectID: "p", Name: "Dependency fixture", Version: 1, Transport: "streamable-http", Channel: "agent", Endpoint: upstream.URL, TimeoutMs: 1000, AuthMode: "none", Args: []string{}, Env: []wire.ConfigEntry{}, Headers: []wire.ConfigEntry{{Name: "X-Resolved", Value: "{{PRIVATE}}"}}, OauthScopes: []string{}}
			a := &authority{a: platformclient.Authorized{Connection: connection, Variables: []wire.Variable{
				{ID: "private", ProjectID: "p", ConnectionID: "c", Name: "PRIVATE", Type: "json", Sensitive: true, Required: true},
				{ID: "cycle", ProjectID: "p", ConnectionID: "c", Name: "CYCLE", Type: "string", ValueJSON: `"{{PRIVATE}}"`},
			}, Policy: wire.RecordRedactionPolicy{ProjectID: "p", Pointers: []string{}}, Capacity: wire.RecordCapacity{ProjectID: "p"}}}
			queue := &captureQueue{input: make(chan wire.RecordUploadInput, 1)}
			e := New(Config{Platform: a, Vault: store, Values: storeValues{store}, Queue: queue})
			defer e.Close()
			s := pairing.Session{UserID: "u", PairingID: "pair", Grant: pairing.Grant{UserID: "u"}}
			input := agentwire.AgentConnectInput{ProjectID: "p", ConnectionID: "c", Version: 1}
			save(entry.value)
			state, err := e.Connect(ctx, s, input)
			if err == nil || err.Error() != "environment_value_missing" || state.Status != "failed" {
				t.Fatalf("invalid connect: status=%s error=%v", state.Status, err)
			}
			if requests.Load() != 0 || calls.Load() != 0 {
				t.Fatal("invalid connect reached upstream")
			}
			save(`{"deep":["ready"]}`)
			if state, err = e.Connect(ctx, s, input); err != nil || state.Status != "connected" {
				t.Fatal("valid control could not connect", err)
			}
			before := requests.Load()
			if before == 0 {
				t.Fatal("control did not use real MCP handshake")
			}
			// Same connection/definition versions, different live personal values:
			// this must re-resolve rather than reuse the successful connection.
			save(entry.value)
			run, err := e.Run(ctx, s, agentwire.AgentRunInput{ProjectID: "p", ConnectionID: "c", Version: 1, TabID: "tab", ToolName: "echo", ArgumentsJSON: `{}`})
			if err == nil || err.Error() != "environment_value_missing" || run.RunID != "" {
				t.Fatalf("invalid Run accepted: %s %v", run.RunID, err)
			}
			if requests.Load() != before || calls.Load() != 0 || len(queue.input) != 0 {
				t.Fatal("invalid Run called upstream or queued a record")
			}
			save(`{"deep":["ready"]}`)
			run, err = e.Run(ctx, s, agentwire.AgentRunInput{ProjectID: "p", ConnectionID: "c", Version: 1, TabID: "repaired", ToolName: "echo", ArgumentsJSON: `{}`})
			if err != nil || run.RunID == "" {
				t.Fatal("explicit repaired Run did not start", err)
			}
			select {
			case stored := <-queue.input:
				if stored.Snapshot.RunStatus != "succeeded" || stored.Snapshot.RunID != run.RunID || calls.Load() != 1 {
					t.Fatal("repaired Run not recorded once")
				}
				data, err := json.Marshal(stored)
				if err != nil || !json.Valid(data) {
					t.Fatal("invalid frozen record")
				}
			case <-time.After(3 * time.Second):
				t.Fatal("repaired real Tool never completed")
			}
		})
	}
}
