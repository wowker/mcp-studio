package main

import (
	"context"
	"encoding/json"
	"errors"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"mcp-studio/internal/agent/localapi"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/queue"
	"mcp-studio/internal/agent/sessions"
	"mcp-studio/internal/agent/vault"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type lifecycleAuthority struct{ connection wire.Connection }

func (a lifecycleAuthority) Exchange(context.Context, string, string) (pairing.Grant, error) {
	return pairing.Grant{Token: "isolated-platform-grant", UserID: "u", DeviceID: "d", Origin: "https://work.example", ExpiresAt: time.Now().Add(time.Hour)}, nil
}
func (a lifecycleAuthority) Validate(context.Context, pairing.Grant) error { return nil }
func (a lifecycleAuthority) Authorize(context.Context, pairing.Grant, platformclient.ConnectionRequest, string) (platformclient.Authorized, error) {
	return platformclient.Authorized{Connection: a.connection, Policy: wire.RecordRedactionPolicy{ProjectID: "p", Pointers: []string{}}, Capacity: wire.RecordCapacity{ProjectID: "p"}}, nil
}

type lifecycleKeys struct {
	mu     sync.Mutex
	values map[string][]byte
}

func (k *lifecycleKeys) Read(_ context.Context, id string) ([]byte, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	v, ok := k.values[id]
	if !ok {
		return nil, vault.ErrKeyMissing
	}
	return append([]byte{}, v...), nil
}
func (k *lifecycleKeys) Create(_ context.Context, id string, value []byte) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	if _, ok := k.values[id]; ok {
		return vault.ErrKeyExists
	}
	k.values[id] = append([]byte{}, value...)
	return nil
}
func (k *lifecycleKeys) Delete(_ context.Context, id string) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	delete(k.values, id)
	return nil
}

// This exercises the production local API, pairing manager, session engine,
// encrypted queue and an actual MCP server. Only OS confirmation/key storage
// and the external platform authority are controlled test dependencies.
func TestExplicitUnpairRejectsOldChannelAndPlatformGrantWithoutNewToolCall(t *testing.T) {
	var calls atomic.Int32
	server := sdk.NewServer(&sdk.Implementation{Name: "isolated-unpair", Version: "1"}, nil)
	server.AddTool(&sdk.Tool{Name: "echo", InputSchema: map[string]any{"type": "object"}}, func(context.Context, *sdk.CallToolRequest) (*sdk.CallToolResult, error) {
		calls.Add(1)
		return &sdk.CallToolResult{Content: []sdk.Content{&sdk.TextContent{Text: "ok"}}}, nil
	})
	upstream := httptest.NewServer(sdk.NewStreamableHTTPHandler(func(*http.Request) *sdk.Server { return server }, nil))
	defer upstream.Close()
	authority := lifecycleAuthority{wire.Connection{ID: "c", Name: "Controlled MCP", ProjectID: "p", Version: 1, Channel: "agent", Transport: "streamable-http", Endpoint: upstream.URL, TimeoutMs: 1000, AuthMode: "none", Args: []string{}, Env: []wire.ConfigEntry{}, Headers: []wire.ConfigEntry{}, OauthScopes: []string{}}}
	q, err := queue.New(t.TempDir(), "d", &lifecycleKeys{values: map[string][]byte{}})
	if err != nil {
		t.Fatal(err)
	}
	defer q.Close()
	engine := sessions.New(sessions.Config{Platform: authority, Queue: q})
	defer engine.Close()
	prompts := make(chan pairing.Prompt, 1)
	api, err := localapi.New(localapi.Config{Origin: "https://work.example", Host: "127.0.0.1:45455", DeviceID: "d", Platform: authority, Engine: engine, Confirm: func(_ context.Context, p pairing.Prompt) (bool, error) { prompts <- p; return true, nil }})
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, body, token string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "http://127.0.0.1:45455"+path, strings.NewReader(body))
		r.Header.Set("Origin", "https://work.example")
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		api.ServeHTTP(w, r)
		return w
	}
	w := request("POST", "/v1/pairing/challenges", `{"platformProof":"isolated-proof","deviceId":"d","contractVersion":"1.0.0"}`, "")
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var prompt pairing.Prompt
	select {
	case prompt = <-prompts:
	case <-time.After(time.Second):
		t.Fatal("no local prompt")
	}
	body, _ := json.Marshal(map[string]string{"challengeId": prompt.Challenge.ChallengeID, "code": prompt.Code})
	var paired struct {
		Data pairing.Session `json:"data"`
	}
	for deadline := time.Now().Add(time.Second); ; {
		w = request("POST", "/v1/pairing/confirmations", string(body), "")
		if w.Code == 201 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal(w.Code, w.Body.String())
		}
		time.Sleep(time.Millisecond)
	}
	if err = json.Unmarshal(w.Body.Bytes(), &paired); err != nil {
		t.Fatal(err)
	}
	token := paired.Data.ChannelToken
	w = request("POST", "/v1/connections", `{"projectId":"p","connectionId":"c","version":1,"environmentId":""}`, token)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	runBody := `{"projectId":"p","connectionId":"c","version":1,"tabId":"t","toolName":"echo","argumentsJSON":"{}","environmentId":""}`
	w = request("POST", "/v1/runs", runBody, token)
	if w.Code != 202 {
		t.Fatal(w.Code, w.Body.String())
	}
	for deadline := time.Now().Add(time.Second); calls.Load() != 1; {
		if time.Now().After(deadline) {
			t.Fatal("no upstream call")
		}
		time.Sleep(time.Millisecond)
	}
	w = request("DELETE", "/v1/pairing/"+paired.Data.PairingID, "", token)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, old := range []string{token, "isolated-platform-grant"} {
		w = request("POST", "/v1/runs", runBody, old)
		if w.Code != 401 {
			t.Fatal("old credential accepted", w.Code, w.Body.String())
		}
	}
	w = request("POST", "/v1/pairing/confirmations", string(body), "")
	if w.Code != 403 {
		t.Fatal("old confirmation replay accepted", w.Code)
	}
	time.Sleep(50 * time.Millisecond)
	if calls.Load() != 1 {
		t.Fatal("unpair issued another Tool call")
	}
	// Real engine connection was also cleared, preventing direct stale-session reuse.
	if _, err = engine.Run(context.Background(), paired.Data, agentwire.AgentRunInput{ProjectID: "p", ConnectionID: "c", Version: 1, TabID: "t", ToolName: "echo", ArgumentsJSON: "{}"}); err == nil || !errors.Is(err, context.Canceled) && err.Error() != "manual_reconnect_required" {
		t.Fatal("paired connection remains", err)
	}
}
