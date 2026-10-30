package sessions

import (
	"fmt"
	"mcp-studio/internal/agent/pairing"
	agentwire "mcp-studio/internal/agent/wire"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestTerminalCacheReceiptGraceAndPendingExpiry(t *testing.T) {
	var clock atomic.Int64
	clock.Store(time.Now().UnixNano())
	e := New(Config{Now: func() time.Time { return time.Unix(0, clock.Load()) }})
	defer e.Close()
	now := e.now()
	e.runs["recorded"] = &running{state: agentwire.AgentRunState{RunID: "recorded", RecordID: "record", OperationID: "op", UserID: "u", Status: "succeeded", UploadStatus: "recorded", SnapshotJSON: `{"response":0}`}, completedAt: now, recordedAt: now}
	e.runs["pending"] = &running{state: agentwire.AgentRunState{RunID: "pending", UserID: "u", Status: "failed", UploadStatus: "pending", SnapshotJSON: `{"response":null}`}, completedAt: now}
	s := pairing.Session{UserID: "u"}
	if state, _ := e.RunState(s, "recorded"); state.SnapshotJSON == "" {
		t.Fatal("grace missing")
	}
	clock.Add(int64(time.Minute))
	state, err := e.RunState(s, "recorded")
	if err != nil || state.SnapshotJSON != "" || state.Diagnostic != "result_evicted" || state.RunID != "recorded" || state.UploadStatus != "recorded" {
		t.Fatal("receipt grace did not evict body", state, err)
	}
	if state, _ := e.RunState(s, "pending"); state.SnapshotJSON == "" {
		t.Fatal("pending evicted before TTL")
	}
	clock.Add(int64(4 * time.Minute))
	if state, _ := e.RunState(s, "pending"); state.SnapshotJSON != "" || state.Diagnostic != "result_evicted" {
		t.Fatal("pending body survives 5 minute TTL", state)
	}
}
func TestTerminalCacheCountBytesAndActivePreservation(t *testing.T) {
	now := time.Now()
	e := New(Config{Now: func() time.Time { return now }})
	defer e.Close()
	for i := 0; i < 1001; i++ {
		id := fmt.Sprintf("terminal-%04d", i)
		e.runs[id] = &running{state: agentwire.AgentRunState{RunID: id, UserID: "u", Status: "succeeded", SnapshotJSON: "{}"}, completedAt: now.Add(time.Duration(i-1001) * time.Nanosecond)}
	}
	e.runs["active"] = &running{state: agentwire.AgentRunState{RunID: "active", UserID: "u", Status: "running"}}
	if _, err := e.RunState(pairing.Session{UserID: "u"}, "terminal-1000"); err != nil {
		t.Fatal(err)
	}
	if len(e.runs) != 1001 || e.runs["terminal-0000"] != nil || e.runs["active"] == nil {
		t.Fatal("metadata or active limit", len(e.runs))
	}
	e.runs = map[string]*running{}
	large := strings.Repeat("x", 50<<20)
	for i, body := range []string{large, large, "x"} {
		id := fmt.Sprint(i)
		e.runs[id] = &running{state: agentwire.AgentRunState{RunID: id, UserID: "u", Status: "succeeded", SnapshotJSON: body}, completedAt: now.Add(time.Duration(i-3) * time.Nanosecond)}
	}
	e.RunState(pairing.Session{UserID: "u"}, "2")
	if e.runs["0"].state.SnapshotJSON != "" || e.runs["1"].state.SnapshotJSON == "" || e.runs["0"].state.Diagnostic != "result_evicted" {
		t.Fatal("100 MiB limit failed")
	}
}
