package sessions

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/queue"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/wire"
)

// This seam controls current read/write authority. Sessions are supplied directly
// to ServeAuthenticated; this is not localapi pairing or real platform role proof.
type a38RetryAuthority struct {
	authority
	viewer  atomic.Bool
	uploads atomic.Int32
	inputs  chan wire.RecordUploadInput
}

func (a *a38RetryAuthority) Authorize(ctx context.Context, g pairing.Grant, in platformclient.ConnectionRequest, action string) (platformclient.Authorized, error) {
	if a.viewer.Load() && action == "execute" {
		return platformclient.Authorized{}, errors.New("project_permission_revoked")
	}
	return a.authority.Authorize(ctx, g, in, action)
}
func (a *a38RetryAuthority) Current(context.Context, pairing.Grant, string, string) (platformclient.Authorized, error) {
	return a.a, nil // Viewer retains read authority; upload must check write authority.
}
func (a *a38RetryAuthority) Upload(_ context.Context, _ pairing.Grant, in wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
	n := a.uploads.Add(1)
	a.inputs <- in
	if n == 1 {
		return wire.RecordOperationReceipt{}, errors.New("platform_unavailable")
	}
	if a.viewer.Load() {
		return wire.RecordOperationReceipt{}, errors.New("project_permission_revoked")
	}
	return wire.RecordOperationReceipt{OperationID: in.OperationID, TargetKind: "history", TargetID: in.TargetID, RecordID: in.TargetID, ResponsibleEndpoint: "agent", FrozenDigest: in.FrozenDigest, Status: "recorded"}, nil
}

func TestA38AuthenticatedRetryEnforcesOwnerProjectEndpointAndCurrentWrite(t *testing.T) {
	var calls atomic.Int32
	mcp := sdk.NewServer(&sdk.Implementation{Name: "a38-retry-fixture", Version: "1"}, nil)
	mcp.AddTool(&sdk.Tool{Name: "echo", InputSchema: map[string]any{"type": "object"}}, func(context.Context, *sdk.CallToolRequest) (*sdk.CallToolResult, error) {
		calls.Add(1)
		return &sdk.CallToolResult{Content: []sdk.Content{&sdk.TextContent{Text: "a38-private-queued-body"}}}, nil
	})
	up := httptest.NewServer(sdk.NewStreamableHTTPHandler(func(*http.Request) *sdk.Server { return mcp }, nil))
	defer up.Close()
	q, err := queue.New(t.TempDir(), "a38-device", &memoryKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer q.Close()
	a := &a38RetryAuthority{authority: authority{a: platformclient.Authorized{Connection: wire.Connection{ID: "c", ProjectID: "p", Version: 1, Name: "fixture", Channel: "agent", Transport: "streamable-http", Endpoint: up.URL, TimeoutMs: 1000, AuthMode: "none", Args: []string{}, Env: []wire.ConfigEntry{}, Headers: []wire.ConfigEntry{}, OauthScopes: []string{}}, Policy: wire.RecordRedactionPolicy{ProjectID: "p", Pointers: []string{}}, Capacity: wire.RecordCapacity{ProjectID: "p"}}}, inputs: make(chan wire.RecordUploadInput, 4)}
	e := New(Config{Platform: a, Queue: q})
	defer e.Close()
	owner := pairing.Session{UserID: "owner", PairingID: "pair", Grant: pairing.Grant{UserID: "owner"}}
	if _, err = e.Connect(context.Background(), owner, agentwire.AgentConnectInput{ProjectID: "p", ConnectionID: "c", Version: 1}); err != nil {
		t.Fatal(err)
	}
	run, err := e.Run(context.Background(), owner, agentwire.AgentRunInput{ProjectID: "p", ConnectionID: "c", Version: 1, TabID: "tab", ToolName: "echo", ArgumentsJSON: `{}`})
	if err != nil {
		t.Fatal(err)
	}
	var frozen queue.State
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		frozen, err = q.Get(context.Background(), owner.UserID, run.OperationID)
		if err == nil && frozen.Status == "failed" {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if err != nil || frozen.Status != "failed" || !frozen.Persisted || calls.Load() != 1 || a.uploads.Load() != 1 || !strings.Contains(frozen.Input.Snapshot.ResponseJSON, "a38-private-queued-body") {
		t.Fatal("missing real Tool/encrypted failed-upload baseline", err, frozen.Status, frozen.Persisted, calls.Load(), a.uploads.Load())
	}
	if !reflect.DeepEqual(<-a.inputs, frozen.Input) {
		t.Fatal("initial upload differs from frozen queue input")
	}
	browser := frozen.Input
	browser.OperationID = "browser-operation"
	browser.ResponsibleEndpoint = "browser"
	browser.Snapshot.Executor = "browser"
	raw, _ := json.Marshal(browser)
	browser.FrozenDigest, err = recording.Digest(string(raw))
	if err != nil || q.Enqueue(context.Background(), browser) == nil {
		t.Fatal("Agent queue admitted browser responsibility", err)
	}
	post := func(prefix, op, pid string, s pairing.Session) *httptest.ResponseRecorder {
		r := httptest.NewRequest("POST", "http://127.0.0.1/v1/"+prefix+"/"+op+"/retry", strings.NewReader(`{"projectId":"`+pid+`"}`))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		e.ServeAuthenticated(w, r, s)
		return w
	}
	foreign := pairing.Session{UserID: "other", Grant: pairing.Grant{UserID: "other"}}
	for _, prefix := range []string{"queue", "operations"} {
		for _, tc := range []struct {
			name, op, pid string
			s             pairing.Session
			status        int
		}{
			{"foreign-owner", run.OperationID, "p", foreign, 409},
			{"wrong-project", run.OperationID, "other-project", owner, 404},
			{"not-held-operation", "not-held-operation", "p", owner, 409},
			{"browser-responsibility", browser.OperationID, "p", owner, 409},
		} {
			t.Run(prefix+"/"+tc.name, func(t *testing.T) {
				w := post(prefix, tc.op, tc.pid, tc.s)
				if w.Code != tc.status || strings.Contains(w.Body.String(), "a38-private-queued-body") || strings.Contains(w.Body.String(), "inputJSON") {
					t.Fatal("denial leaked queue body or returned wrong status", w.Code, w.Body.String())
				}
				after, err := q.Get(context.Background(), owner.UserID, run.OperationID)
				if err != nil || !reflect.DeepEqual(after, frozen) || calls.Load() != 1 || a.uploads.Load() != 1 {
					t.Fatal("denied retry changed owner queue or performed side effects", err, calls.Load(), a.uploads.Load())
				}
			})
		}
	}
	a.viewer.Store(true)
	if _, err := e.Run(context.Background(), owner, agentwire.AgentRunInput{ProjectID: "p", ConnectionID: "c", Version: 1, TabID: "tab", ToolName: "echo", ArgumentsJSON: `{}`}); err == nil {
		t.Fatal("controlled Viewer executed Tool")
	}
	for index, prefix := range []string{"queue", "operations"} {
		w := post(prefix, run.OperationID, "p", owner)
		if w.Code != 409 || !strings.Contains(w.Body.String(), "project_permission_revoked") || strings.Contains(w.Body.String(), "a38-private-queued-body") {
			t.Fatal("controlled read-only write authority bypassed", w.Code, w.Body.String())
		}
		row, err := q.Get(context.Background(), owner.UserID, run.OperationID)
		if err != nil || row.Status != "failed" || row.Receipt != nil || !reflect.DeepEqual(row.Input, frozen.Input) || a.uploads.Load() != int32(index+2) || !reflect.DeepEqual(<-a.inputs, frozen.Input) || calls.Load() != 1 {
			t.Fatal("read-only denial lost frozen input or replayed Tool", err)
		}
	}
	a.viewer.Store(false)
	for _, prefix := range []string{"queue", "operations"} {
		w := post(prefix, run.OperationID, "p", owner)
		row, err := q.Get(context.Background(), owner.UserID, run.OperationID)
		if w.Code != 200 || err != nil || row.Status != "recorded" || row.Input.OperationID != frozen.Input.OperationID || row.Input.TargetID != frozen.Input.TargetID || row.Input.FrozenDigest != frozen.Input.FrozenDigest || calls.Load() != 1 || a.uploads.Load() != 4 {
			t.Fatal("owner retry lost identity/digest or replayed recorded upload/Tool", w.Code, err, calls.Load(), a.uploads.Load())
		}
	}
	if !reflect.DeepEqual(<-a.inputs, frozen.Input) {
		t.Fatal("successful retry changed frozen upload")
	}
}
