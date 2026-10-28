package sessions

import (
	"context"
	"encoding/json"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type authority struct {
	a      platformclient.Authorized
	denied atomic.Bool
}

func (a *authority) Authorize(context.Context, pairing.Grant, platformclient.ConnectionRequest, string) (platformclient.Authorized, error) {
	if a.denied.Load() {
		return a.a, context.Canceled
	}
	return a.a, nil
}

type captureQueue struct{ input chan wire.RecordUploadInput }

func (q *captureQueue) Admit(context.Context, string, string) error { return nil }
func (q *captureQueue) Enqueue(_ context.Context, in wire.RecordUploadInput) error {
	q.input <- in
	return nil
}
func TestRunSurvivesRequestCancellationAndOwnsSafeFrozenSnapshot(t *testing.T) {
	server := sdk.NewServer(&sdk.Implementation{Name: "fixture", Version: "1"}, nil)
	var calls atomic.Int32
	server.AddTool(&sdk.Tool{Name: "echo", InputSchema: map[string]any{"type": "object", "properties": map[string]any{"password": map[string]any{"type": "string"}, "private-value": map[string]any{"type": "string"}}}}, func(ctx context.Context, r *sdk.CallToolRequest) (*sdk.CallToolResult, error) {
		calls.Add(1)
		time.Sleep(50 * time.Millisecond)
		return &sdk.CallToolResult{Content: []sdk.Content{&sdk.TextContent{Text: "private-value"}}}, nil
	})
	up := httptest.NewServer(sdk.NewStreamableHTTPHandler(func(*http.Request) *sdk.Server { return server }, nil))
	defer up.Close()
	a := &authority{a: platformclient.Authorized{Connection: wire.Connection{ID: "c", Name: "Fixture", ProjectID: "p", Version: 1, Channel: "agent", Transport: "streamable-http", Endpoint: up.URL, TimeoutMs: 1000, AuthMode: "none", Args: []string{}, Env: []wire.ConfigEntry{}, Headers: []wire.ConfigEntry{}, OauthScopes: []string{}}, Policy: wire.RecordRedactionPolicy{ProjectID: "p", Pointers: []string{}}, Capacity: wire.RecordCapacity{ProjectID: "p"}}}
	q := &captureQueue{make(chan wire.RecordUploadInput, 1)}
	e := New(Config{Platform: a, Queue: q})
	s := pairing.Session{UserID: "u", PairingID: "pair", Grant: pairing.Grant{UserID: "u"}}
	if _, err := e.Connect(context.Background(), s, agentwire.AgentConnectInput{ProjectID: "p", ConnectionID: "c", Version: 1}); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	r, err := e.Run(ctx, s, agentwire.AgentRunInput{ProjectID: "p", ConnectionID: "c", Version: 1, TabID: "t", ToolName: "echo", ArgumentsJSON: `{"password":"private-value"}`})
	cancel()
	e.Unpair(s)
	if err != nil {
		t.Fatal(err)
	}
	select {
	case input := <-q.input:
		b, _ := json.Marshal(input)
		if string(b) == "" || contains(string(b), "private-value") {
			t.Fatal("raw response persisted")
		}
		if input.Snapshot.RunStatus != "succeeded" || input.Snapshot.Executor != "agent" || input.ResponsibleEndpoint != "agent" || input.TargetID == r.RunID || input.OperationID == r.RunID {
			t.Fatalf("%+v", input)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("run cancelled by browser")
	}
	if calls.Load() != 1 {
		t.Fatal("replayed tool")
	}
	a.denied.Store(true)
	if _, err = e.Run(context.Background(), s, agentwire.AgentRunInput{ProjectID: "p", ConnectionID: "c", Version: 1, TabID: "t", ToolName: "echo", ArgumentsJSON: `{}`}); err == nil {
		t.Fatal("stale authority used")
	}
}
func contains(s, v string) bool {
	for i := 0; i+len(v) <= len(s); i++ {
		if s[i:i+len(v)] == v {
			return true
		}
	}
	return false
}
func TestRedactSnapshotContextFreezesPlatformMasking(t *testing.T) {
	versionHash := "ab1234567890" + strings.Repeat("c", 52)
	clean := strings.Repeat("d", 64)
	snapshot := wire.ExecutionSnapshot{ToolName: "echo", ToolDefinitionVersion: clean, EnvironmentVersion: versionHash, OmissionReason: "", Redactions: []wire.RedactionMarker{{Path: "/request/token", Reason: "source"}}}
	redactSnapshotContext(&snapshot, nil, nil)
	if snapshot.EnvironmentVersion != "[REDACTED]" || snapshot.ToolName != "echo" || snapshot.ToolDefinitionVersion != clean || snapshot.OmissionReason != "" {
		t.Fatalf("context = %q %q %q %q", snapshot.ToolName, snapshot.ToolDefinitionVersion, snapshot.EnvironmentVersion, snapshot.OmissionReason)
	}
	want := []wire.RedactionMarker{{Path: "/context/environmentVersion", Reason: "default"}, {Path: "/request/token", Reason: "source"}}
	if !reflect.DeepEqual(snapshot.Redactions, want) {
		t.Fatalf("redactions = %#v", snapshot.Redactions)
	}
}
