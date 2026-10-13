package sessions

import (
	"context"
	"encoding/json"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/queue"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type uploadAuthority struct {
	authority
	uploads atomic.Int32
}

func (a *uploadAuthority) Project(context.Context, pairing.Grant, string) error { return nil }
func (a *uploadAuthority) Upload(_ context.Context, _ pairing.Grant, in wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
	if a.uploads.Add(1) == 1 {
		return wire.RecordOperationReceipt{}, context.Canceled
	}
	return wire.RecordOperationReceipt{OperationID: in.OperationID, TargetKind: "history", TargetID: in.TargetID, RecordID: in.TargetID, ResponsibleEndpoint: "agent", FrozenDigest: in.FrozenDigest, Status: "recorded"}, nil
}
func TestRetryUploadsFrozenAgentInputWithoutReplayingTool(t *testing.T) {
	var calls atomic.Int32
	server := sdk.NewServer(&sdk.Implementation{Name: "queue-fixture", Version: "1"}, nil)
	server.AddTool(&sdk.Tool{Name: "echo", InputSchema: map[string]any{"type": "object"}}, func(context.Context, *sdk.CallToolRequest) (*sdk.CallToolResult, error) {
		calls.Add(1)
		return &sdk.CallToolResult{Content: []sdk.Content{&sdk.TextContent{Text: "result"}}}, nil
	})
	up := httptest.NewServer(sdk.NewStreamableHTTPHandler(func(*http.Request) *sdk.Server { return server }, nil))
	defer up.Close()
	q, err := queue.New(t.TempDir(), "device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer q.Close()
	a := &uploadAuthority{authority: authority{a: platformclient.Authorized{Connection: wire.Connection{ID: "c", ProjectID: "p", Version: 1, Name: "fixture", Channel: "agent", Transport: "streamable-http", Endpoint: up.URL, TimeoutMs: 1000, AuthMode: "none", Args: []string{}, Env: []wire.ConfigEntry{}, Headers: []wire.ConfigEntry{}, OauthScopes: []string{}}, Policy: wire.RecordRedactionPolicy{ProjectID: "p", Pointers: []string{}}, Capacity: wire.RecordCapacity{ProjectID: "p"}}}}
	e := New(Config{Platform: a, Queue: q})
	defer e.Close()
	s := pairing.Session{UserID: "u", PairingID: "pair", Grant: pairing.Grant{UserID: "u"}}
	if _, err = e.Connect(context.Background(), s, agentwire.AgentConnectInput{ProjectID: "p", ConnectionID: "c", Version: 1}); err != nil {
		t.Fatal(err)
	}
	run, err := e.Run(context.Background(), s, agentwire.AgentRunInput{ProjectID: "p", ConnectionID: "c", Version: 1, TabID: "t", ToolName: "echo", ArgumentsJSON: `{}`})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 200; i++ {
		state, err := q.Get(context.Background(), "u", run.OperationID)
		if err == nil && state.Status == "failed" {
			break
		}
		time.Sleep(time.Millisecond * 5)
	}
	r := httptest.NewRequest("POST", "http://127.0.0.1/v1/queue/"+run.OperationID+"/retry", strings.NewReader(`{"projectId":"p"}`))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	e.ServeAuthenticated(w, r, s)
	if w.Code != 200 || a.uploads.Load() != 2 || calls.Load() != 1 {
		t.Fatal(w.Code, w.Body.String(), a.uploads.Load(), calls.Load())
	}
	var envelope struct {
		Data agentwire.AgentQueueState `json:"data"`
	}
	json.Unmarshal(w.Body.Bytes(), &envelope)
	if envelope.Data.Status != "recorded" {
		t.Fatal(envelope.Data)
	}
	state, err := e.RunState(s, run.RunID)
	if err != nil || state.UploadStatus != "recorded" || state.SnapshotJSON == "" {
		t.Fatal(state, err)
	}
	r = httptest.NewRequest("GET", "http://127.0.0.1/v1/operations/"+run.OperationID, nil)
	w = httptest.NewRecorder()
	e.ServeAuthenticated(w, r, s)
	json.Unmarshal(w.Body.Bytes(), &envelope)
	if envelope.Data.OperationID != run.OperationID {
		t.Fatal("operation contract mismatch", w.Body.String())
	}
}
