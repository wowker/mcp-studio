package queue

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mcp-studio/internal/agent/vault"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/wire"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type keys struct {
	key  []byte
	fail bool
}

func (k *keys) Read(context.Context, string) ([]byte, error) {
	if k.fail {
		return nil, vault.ErrUnavailable
	}
	if k.key == nil {
		return nil, vault.ErrKeyMissing
	}
	return append([]byte(nil), k.key...), nil
}
func (k *keys) Create(_ context.Context, _ string, v []byte) error {
	if k.fail {
		return vault.ErrUnavailable
	}
	k.key = append([]byte(nil), v...)
	return nil
}
func (k *keys) Delete(context.Context, string) error { k.key = nil; return nil }
func input(t *testing.T, uid, pid, op string) wire.RecordUploadInput {
	t.Helper()
	s := wire.ExecutionSnapshot{UserID: uid, ProjectID: pid, ConnectionID: "c", TabID: "tab", RunID: "run-" + op, ToolName: "echo", ConfigurationVersion: 1, ToolDefinitionVersion: "v1", EnvironmentVersion: "v1", Executor: "agent", CredentialSource: "none", RequestJSON: `{"text":"safe queued fixture"}`, InputSchemaJSON: `{"type":"object"}`, ResponseJSON: `{"content":[]}`, ProtocolJSON: `{}`, StartedAt: "2026-10-13T00:00:00Z", FinishedAt: "2026-10-13T00:00:01Z", RunStatus: "succeeded", RemoteOutcome: "known", ResultKind: "success", ResponseRetention: "full", SchemaValid: true}
	s.Redactions = make([]wire.RedactionMarker, 0)
	i := wire.RecordUploadInput{ContractVersion: "1.2.0", OperationID: op, UserID: uid, ProjectID: pid, ConnectionID: "c", TargetKind: "history", TargetID: "record-" + op, ResponsibleEndpoint: "agent", Snapshot: s, Metadata: wire.RecordMetadata{Name: "echo", Visibility: "project", ContentKind: "request-response", Completeness: "complete"}}
	raw, _ := json.Marshal(i)
	sum, e := recording.Digest(string(raw))
	if e != nil {
		t.Fatal(e)
	}
	i.FrozenDigest = sum
	return i
}
func result(i wire.RecordUploadInput) wire.RecordOperationReceipt {
	return wire.RecordOperationReceipt{OperationID: i.OperationID, TargetKind: i.TargetKind, TargetID: i.TargetID, FrozenDigest: i.FrozenDigest, ResponsibleEndpoint: "agent", Status: "recorded", RecordID: i.TargetID, Version: 1, Etag: "v1", RecordedAt: "2026-10-13T00:00:02Z", AffectedRecords: []wire.AffectedRecord{}}
}
func TestEncryptedQueueRestartReceiptAndOwnerIsolation(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	master := &keys{}
	q, e := New(root, "device", master)
	if e != nil {
		t.Fatal(e)
	}
	defer q.Close()
	in := input(t, "u", "p", "op")
	if e = q.Enqueue(ctx, in); e != nil {
		t.Fatal(e)
	}
	_ = filepath.Walk(root, func(p string, f os.FileInfo, e error) error {
		if e == nil && !f.IsDir() {
			raw, _ := os.ReadFile(p)
			if bytes.Contains(raw, []byte("safe queued fixture")) || bytes.Contains(raw, master.key) {
				t.Fatal("plaintext disk")
			}
		}
		return nil
	})
	in.Snapshot.RequestJSON = `{"edited":"later"}`
	q2, e := New(root, "device", master)
	if e != nil {
		t.Fatal(e)
	}
	defer q2.Close()
	own, e := q2.List(ctx, "u", "p")
	if e != nil || len(own) != 1 || own[0].Input.Snapshot.RequestJSON == in.Snapshot.RequestJSON {
		t.Fatal("changed frozen body", e)
	}
	foreign, e := q2.List(ctx, "other", "p")
	if e != nil || len(foreign) != 0 {
		t.Fatal("foreign queue", e)
	}
	calls := 0
	receipt, e := q2.Retry(ctx, "u", "p", "op", func(_ context.Context, i wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
		calls++
		return result(i), nil
	})
	if e != nil || receipt.Status != "recorded" {
		t.Fatal(e)
	}
	q3, e := New(root, "device", master)
	if e != nil {
		t.Fatal(e)
	}
	defer q3.Close()
	if _, e = q3.Retry(ctx, "u", "p", "op", func(context.Context, wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
		calls++
		return wire.RecordOperationReceipt{}, nil
	}); e != nil || calls != 1 {
		t.Fatal("replayed recorded upload", e)
	}
	_ = filepath.Walk(root, func(p string, f os.FileInfo, e error) error {
		if e == nil && !f.IsDir() && bytes.Contains(mustRead(p), []byte("safe queued fixture")) {
			t.Fatal("receipt retains plaintext")
		}
		return nil
	})
}
func mustRead(p string) []byte { b, _ := os.ReadFile(p); return b }
func TestQueueLostReceiptRetainsExactInputAndSevenDayReminder(t *testing.T) {
	ctx := context.Background()
	q, e := New(t.TempDir(), "device", &keys{})
	if e != nil {
		t.Fatal(e)
	}
	defer q.Close()
	in := input(t, "u", "p", "op")
	q.Now = func() time.Time { return time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC) }
	if e = q.Enqueue(ctx, in); e != nil {
		t.Fatal(e)
	}
	_, e = q.Retry(ctx, "u", "p", "op", func(context.Context, wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
		return wire.RecordOperationReceipt{}, errors.New("network")
	})
	if e == nil {
		t.Fatal("false receipt")
	}
	q.Now = func() time.Time { return time.Date(2026, 10, 13, 0, 0, 0, 0, time.UTC) }
	rows, e := q.List(ctx, "u", "p")
	if e != nil || len(rows) != 1 || !rows[0].Stale || rows[0].Input.FrozenDigest != in.FrozenDigest {
		t.Fatal(rows, e)
	}
	_, e = q.Retry(ctx, "u", "p", "op", func(_ context.Context, i wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
		if i.FrozenDigest != in.FrozenDigest {
			t.Fatal("snapshot changed")
		}
		return result(i), nil
	})
	if e != nil {
		t.Fatal(e)
	}
}
func TestQueueUnavailableRequiresExplicitOwnerMemoryChoice(t *testing.T) {
	ctx := context.Background()
	q, e := New(t.TempDir(), "device", &keys{fail: true})
	if e != nil {
		t.Fatal(e)
	}
	defer q.Close()
	if e = q.Admit(ctx, "u", "p"); e == nil {
		t.Fatal("storage silently bypassed")
	}
	if e = q.SetRetentionForUser("u", "memory"); e != nil {
		t.Fatal(e)
	}
	if e = q.Admit(ctx, "u", "p"); e != nil {
		t.Fatal(e)
	}
	if e = q.Admit(ctx, "other", "p"); e == nil {
		t.Fatal("borrowed other user's consent")
	}
	if e = q.Enqueue(ctx, input(t, "u", "p", "op")); e != nil {
		t.Fatal(e)
	}
	rows, e := q.List(ctx, "u", "p")
	if e != nil || len(rows) != 1 || rows[0].Persisted || !rows[0].LossRisk {
		t.Fatal(rows, e)
	}
}

func TestQueueLockedVaultRecoversWithoutCallingTool(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	master := &keys{}
	q, err := New(root, "device", master)
	if err != nil {
		t.Fatal(err)
	}
	if err = q.Enqueue(ctx, input(t, "u", "p", "op")); err != nil {
		t.Fatal(err)
	}
	q.Close()
	master.fail = true
	q, err = New(root, "device", master)
	if err != nil {
		t.Fatal(err)
	}
	defer q.Close()
	if _, err = q.List(ctx, "u", "p"); !errors.Is(err, vault.ErrUnavailable) {
		t.Fatal("locked vault mislabeled", err)
	}
	master.fail = false
	rows, err := q.List(ctx, "u", "p")
	if err != nil || len(rows) != 1 || rows[0].Input.OperationID != "op" {
		t.Fatal("unlock did not recover queue", rows, err)
	}
}

func TestReceiptErasesFrozenPayloadAndQuotaIncludesReservations(t *testing.T) {
	ctx := context.Background()
	q, err := New(t.TempDir(), "device", &keys{})
	if err != nil {
		t.Fatal(err)
	}
	defer q.Close()
	in := input(t, "u", "p", "op")
	if err = q.Enqueue(ctx, in); err != nil {
		t.Fatal(err)
	}
	if _, err = q.Retry(ctx, "u", "p", "op", func(_ context.Context, i wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
		return result(i), nil
	}); err != nil {
		t.Fatal(err)
	}
	raw, err := q.disk.Read(ctx, file(in), []byte(file(in)))
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("safe queued fixture")) || bytes.Contains(raw, []byte("responseJSON\\\":\\\"{\\\"")) {
		t.Fatal("recorded ciphertext still contains frozen body")
	}
	var done State
	if err = json.Unmarshal(raw, &done); err != nil {
		t.Fatal(err)
	}
	if done.Input.Snapshot.RequestJSON != "" || done.Input.Snapshot.ResponseJSON != "" || done.Input.Snapshot.InputSchemaJSON != "" || done.Bytes != 0 || done.Receipt == nil {
		t.Fatal("payload retention", done)
	}
	for n := 0; n < CountLimit; n++ {
		if err = q.Reserve(ctx, "u", "p", fmt.Sprintf("reserve-%d", n)); err != nil {
			t.Fatal(n, err)
		}
	}
	if err = q.Admit(ctx, "u", "p"); !errors.Is(err, ErrFull) {
		t.Fatal("reservations bypassed capacity", err)
	}
	if err = q.Admit(ctx, "other", "p"); err != nil {
		t.Fatal("foreign quota leaked", err)
	}
	q.Release("other", "p", "reserve-0")
	if err = q.Admit(ctx, "u", "p"); !errors.Is(err, ErrFull) {
		t.Fatal("foreign release", err)
	}
	q.Release("u", "p", "reserve-0")
	if err = q.Admit(ctx, "u", "p"); err != nil {
		t.Fatal(err)
	}
	q.entries["bytes\x00u"] = State{Input: wire.RecordUploadInput{UserID: "u", ProjectID: "bytes"}, Status: "pending", Bytes: ByteLimit}
	if err = q.Admit(ctx, "u", "bytes"); !errors.Is(err, ErrFull) {
		t.Fatal("byte boundary", err)
	}
}

func TestRetentionChangeDuringFailedUploadCannotRestoreCiphertext(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	q, err := New(root, "device", &keys{})
	if err != nil {
		t.Fatal(err)
	}
	defer q.Close()
	in := input(t, "u", "p", "op")
	if err = q.Enqueue(ctx, in); err != nil {
		t.Fatal(err)
	}
	started, release, done := make(chan struct{}), make(chan struct{}), make(chan error, 1)
	go func() {
		_, e := q.Retry(ctx, "u", "p", "op", func(context.Context, wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
			close(started)
			<-release
			return wire.RecordOperationReceipt{}, errors.New("upload_failed")
		})
		done <- e
	}()
	<-started
	if err = q.SetRetentionForUser("u", "memory"); err != nil {
		t.Fatal(err)
	}
	close(release)
	<-done
	row, err := q.Get(ctx, "u", "op")
	if err != nil || row.Persisted || !row.LossRisk {
		t.Fatal("memory consent overridden", row, err)
	}
	if _, err = os.Stat(filepath.Join(root, file(in))); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("ciphertext resurrected", err)
	}
}
func TestMemoryChoiceCannotSilentlyLeaveLockedCiphertext(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	master := &keys{}
	q, err := New(root, "device", master)
	if err != nil {
		t.Fatal(err)
	}
	if err = q.Enqueue(ctx, input(t, "u", "p", "op")); err != nil {
		t.Fatal(err)
	}
	q.Close()
	master.fail = true
	q, err = New(root, "device", master)
	if err != nil {
		t.Fatal(err)
	}
	defer q.Close()
	if err = q.SetRetentionForUser("u", "memory"); !errors.Is(err, vault.ErrUnavailable) {
		t.Fatal("claimed memory while ciphertext unreadable", err)
	}
	if q.Mode("u") != "encrypted" {
		t.Fatal("changed retention after failure")
	}
	master.fail = false
	if err = q.SetRetentionForUser("u", "memory"); err != nil {
		t.Fatal(err)
	}
	rows, err := q.List(ctx, "u", "p")
	if err != nil || len(rows) != 1 || rows[0].Persisted || !rows[0].LossRisk {
		t.Fatal(rows, err)
	}
}
