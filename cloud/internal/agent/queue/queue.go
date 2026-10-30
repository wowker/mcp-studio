// Package queue persists only frozen sanitized uploads. It has no MCP execution API.
package queue

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mcp-studio/internal/agent/vault"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/wire"
	"strings"
	"sync"
	"time"
)

var ErrFull = errors.New("queue_full")
var ErrBusy = errors.New("operation_busy")
var ErrCorrupt = errors.New("queue_corrupt")
var ErrMissing = errors.New("operation_missing")
var ErrConflict = errors.New("operation_conflict")

const CountLimit = 1000
const ByteLimit int64 = 100 << 20

type State struct {
	Input     wire.RecordUploadInput       `json:"input"`
	Status    string                       `json:"status"`
	Error     string                       `json:"error"`
	Receipt   *wire.RecordOperationReceipt `json:"receipt,omitempty"`
	CreatedAt time.Time                    `json:"createdAt"`
	Bytes     int64                        `json:"bytes"`
	Persisted bool                         `json:"-"`
	LossRisk  bool                         `json:"-"`
	Stale     bool                         `json:"-"`
}
type Queue struct {
	disk         *vault.Disk
	mu           sync.Mutex
	entries      map[string]State
	busy         map[string]bool
	reservations map[string]string
	damaged      map[string]int
	locked       map[string]bool
	modes        map[string]string
	defaultMode  string
	Now          func() time.Time
}

func New(root, device string, keys vault.MasterStore) (*Queue, error) {
	d, e := vault.OpenDisk(root, device, keys)
	if e != nil {
		return nil, e
	}
	q := &Queue{disk: d, entries: map[string]State{}, busy: map[string]bool{}, reservations: map[string]string{}, damaged: map[string]int{}, locked: map[string]bool{}, modes: map[string]string{}, defaultMode: "encrypted", Now: time.Now}
	names, e := d.Names("queue-")
	if e != nil {
		d.Close()
		return nil, e
	}
	for _, name := range names {
		q.locked[name] = true
	}
	q.recover(context.Background(), "")
	return q, nil
}

// recover retries unreadable ciphertext when the OS key becomes available.
// A temporarily locked key is not damaged data, and never authorizes fallback.
// The caller holds q.mu (except during construction).
func (q *Queue) recover(ctx context.Context, scope string) error {
	var unavailable bool
	for name := range q.locked {
		if scope != "" && !strings.HasPrefix(name, scope) {
			continue
		}
		raw, e := q.disk.Read(ctx, name, []byte(name))
		if errors.Is(e, vault.ErrUnavailable) {
			unavailable = true
			continue
		}
		var row State
		if e == nil {
			dec := json.NewDecoder(strings.NewReader(string(raw)))
			dec.DisallowUnknownFields()
			e = dec.Decode(&row)
			if e == nil && dec.Decode(&struct{}{}) != io.EOF {
				e = ErrCorrupt
			}
		}
		delete(q.locked, name)
		if e != nil || !validState(row) || file(row.Input) != name {
			q.damaged[scopePrefixFromName(name)]++
			continue
		}
		if row.Status == "uploading" {
			row.Status = "pending"
		}
		row.Persisted = true
		q.entries[row.Input.OperationID+"\x00"+row.Input.UserID] = row
	}
	if unavailable {
		return vault.ErrUnavailable
	}
	return nil
}
func (q *Queue) Close() error { return q.disk.Close() }
func clone(s State) State {
	raw, _ := json.Marshal(s)
	var r State
	_ = json.Unmarshal(raw, &r)
	r.Persisted = s.Persisted
	r.LossRisk = s.LossRisk
	r.Stale = s.Stale
	return r
}
func file(i wire.RecordUploadInput) string {
	return "queue-" + vault.Hash([]byte(i.UserID))[:32] + "-" + vault.Hash([]byte(i.ProjectID))[:32] + "-" + vault.Hash([]byte(i.OperationID))[:32] + ".bin"
}
func scopePrefixFromName(s string) string {
	if len(s) >= 72 {
		return s[:72]
	}
	return "unknown"
}
func prefix(uid, pid string) string {
	return "queue-" + vault.Hash([]byte(uid))[:32] + "-" + vault.Hash([]byte(pid))[:32] + "-"
}
func validate(i wire.RecordUploadInput) bool {
	if i.ContractVersion != "1.2.0" || i.ResponsibleEndpoint != "agent" || i.TargetKind != "history" || i.SourceRunID != "" || i.Snapshot.Executor != "agent" || i.Snapshot.UserID != i.UserID || i.Snapshot.ProjectID != i.ProjectID || i.Snapshot.ConnectionID != i.ConnectionID {
		return false
	}
	for _, id := range []string{i.UserID, i.ProjectID, i.ConnectionID, i.OperationID, i.TargetID, i.Snapshot.RunID, i.Snapshot.TabID} {
		if !vault.ValidID(id) {
			return false
		}
	}
	if i.OperationID == i.TargetID || i.OperationID == i.Snapshot.RunID || i.TargetID == i.Snapshot.RunID {
		return false
	}
	raw, _ := json.Marshal(i)
	sum, e := recording.Digest(string(raw))
	return e == nil && sum == i.FrozenDigest
}
func validState(s State) bool {
	if s.Status == "recorded" {
		return s.Receipt != nil && s.Receipt.OperationID == s.Input.OperationID && s.Receipt.FrozenDigest == s.Input.FrozenDigest && s.Receipt.ResponsibleEndpoint == "agent" && s.Receipt.Status == "recorded"
	}
	return (s.Status == "pending" || s.Status == "uploading" || s.Status == "failed" || s.Status == "paused") && validate(s.Input) && s.CreatedAt.Unix() > 0 && s.Bytes > 0
}
func (q *Queue) mode(uid string) string {
	if m := q.modes[uid]; m != "" {
		return m
	}
	return q.defaultMode
}
func (q *Queue) Mode(uid string) string { q.mu.Lock(); defer q.mu.Unlock(); return q.mode(uid) }
func (q *Queue) Available() bool        { return q.disk.Available(context.Background()) }
func (q *Queue) SetRetention(mode string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if mode != "memory" && mode != "encrypted" {
		return errors.New("invalid_retention")
	}
	q.defaultMode = mode
	return nil
}
func (q *Queue) SetRetentionForUser(uid, mode string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if !vault.ValidID(uid) || mode != "memory" && mode != "encrypted" {
		return errors.New("invalid_retention")
	}
	if e := q.recover(context.Background(), "queue-"+vault.Hash([]byte(uid))[:32]+"-"); e != nil {
		return e
	}
	if mode == "encrypted" && !q.disk.Available(context.Background()) {
		return vault.ErrUnavailable
	}
	q.modes[uid] = mode
	for key, row := range q.entries {
		if row.Input.UserID == uid && row.Status != "recorded" {
			if mode == "memory" {
				if row.Persisted && q.disk.Remove(file(row.Input)) != nil {
					row.Error = "storage_cleanup_unconfirmed"
				} else {
					row.Persisted = false
				}
				row.LossRisk = true
			} else {
				if e := q.persist(context.Background(), &row); e != nil {
					q.entries[key] = row
					return e
				}
			}
			q.entries[key] = row
		}
	}
	return nil
}
func (q *Queue) usage(uid, pid string) (int, int64) {
	count := q.damaged[prefix(uid, pid)]
	bytes := int64(0)
	for _, s := range q.entries {
		if s.Input.UserID == uid && s.Input.ProjectID == pid && s.Status != "recorded" {
			count++
			bytes += s.Bytes
		}
	}
	for _, scope := range q.reservations {
		if scope == uid+"\x00"+pid {
			count++
		}
	}
	return count, bytes
}
func (q *Queue) admit(ctx context.Context, uid, pid string) error {
	if e := q.recover(ctx, prefix(uid, pid)); e != nil {
		return e
	}
	if !vault.ValidID(uid) || !vault.ValidID(pid) {
		return errors.New("invalid_identity")
	}
	if q.damaged[prefix(uid, pid)] > 0 {
		return ErrCorrupt
	}
	if q.mode(uid) == "encrypted" && !q.disk.Available(ctx) {
		return vault.ErrUnavailable
	}
	n, b := q.usage(uid, pid)
	if n >= CountLimit || b >= ByteLimit {
		return ErrFull
	}
	return nil
}
func (q *Queue) Admit(ctx context.Context, uid, pid string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.admit(ctx, uid, pid)
}
func (q *Queue) Reserve(ctx context.Context, uid, pid, runid string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if !vault.ValidID(runid) {
		return errors.New("invalid_identity")
	}
	if _, ok := q.reservations[runid]; ok {
		return ErrBusy
	}
	if e := q.admit(ctx, uid, pid); e != nil {
		return e
	}
	q.reservations[runid] = uid + "\x00" + pid
	return nil
}
func (q *Queue) Release(uid, pid, runid string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.reservations[runid] == uid+"\x00"+pid {
		delete(q.reservations, runid)
	}
}
func (q *Queue) persist(ctx context.Context, row *State) error {
	raw, e := json.Marshal(row)
	if e != nil {
		return ErrCorrupt
	}
	if e = q.disk.Write(ctx, file(row.Input), []byte(file(row.Input)), raw); e != nil {
		row.LossRisk = true
		return e
	}
	row.Persisted = true
	row.LossRisk = false
	return nil
}
func (q *Queue) Enqueue(ctx context.Context, in wire.RecordUploadInput) error {
	if !validate(in) {
		return errors.New("invalid_record_input")
	}
	raw, _ := json.Marshal(in)
	var immutable wire.RecordUploadInput
	_ = json.Unmarshal(raw, &immutable)
	q.mu.Lock()
	defer q.mu.Unlock()
	if e := q.recover(ctx, prefix(in.UserID, in.ProjectID)); e != nil {
		return e
	}
	key := in.OperationID + "\x00" + in.UserID
	if previous, ok := q.entries[key]; ok {
		if previous.Input.FrozenDigest != in.FrozenDigest {
			return ErrConflict
		}
		return nil
	}
	delete(q.reservations, in.Snapshot.RunID)
	row := State{Input: immutable, Status: "pending", CreatedAt: q.Now(), Bytes: int64(len(raw)), LossRisk: true}
	q.entries[key] = row
	n, b := q.usage(in.UserID, in.ProjectID)
	var e error
	if n > CountLimit || b > ByteLimit {
		e = ErrFull
	} else if q.mode(in.UserID) == "encrypted" {
		e = q.persist(ctx, &row)
	}
	if e != nil {
		row.Error = safe(e)
		row.Status = "failed"
	}
	q.entries[key] = row
	return e
}
func (q *Queue) List(ctx context.Context, uid, pid string) ([]State, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if e := q.recover(ctx, prefix(uid, pid)); e != nil {
		return nil, e
	}
	if q.damaged[prefix(uid, pid)] > 0 {
		return nil, ErrCorrupt
	}
	out := []State{}
	for _, s := range q.entries {
		if s.Input.UserID == uid && s.Input.ProjectID == pid && s.Status != "recorded" {
			s.Stale = q.Now().Sub(s.CreatedAt) >= 7*24*time.Hour
			out = append(out, clone(s))
		}
	}
	return out, nil
}
func (q *Queue) Get(ctx context.Context, uid, opid string) (State, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if e := q.recover(ctx, "queue-"+vault.Hash([]byte(uid))[:32]+"-"); e != nil {
		return State{}, e
	}
	s, ok := q.entries[opid+"\x00"+uid]
	if !ok {
		return State{}, ErrMissing
	}
	s.Stale = s.Status != "recorded" && q.Now().Sub(s.CreatedAt) >= 7*24*time.Hour
	return clone(s), nil
}
func safe(e error) string {
	if e == nil {
		return ""
	}
	code := e.Error()
	if len(code) < 1 || len(code) > 64 {
		return "upload_failed"
	}
	for _, r := range code {
		if r != '_' && (r < 'a' || r > 'z') {
			return "upload_failed"
		}
	}
	return code
}
func (q *Queue) Retry(ctx context.Context, uid, pid, opid string, upload func(context.Context, wire.RecordUploadInput) (wire.RecordOperationReceipt, error)) (wire.RecordOperationReceipt, error) {
	q.mu.Lock()
	if e := q.recover(ctx, prefix(uid, pid)); e != nil {
		q.mu.Unlock()
		return wire.RecordOperationReceipt{}, e
	}
	key := opid + "\x00" + uid
	row, ok := q.entries[key]
	if !ok || row.Input.ProjectID != pid {
		q.mu.Unlock()
		return wire.RecordOperationReceipt{}, ErrMissing
	}
	if q.busy[key] {
		q.mu.Unlock()
		return wire.RecordOperationReceipt{}, ErrBusy
	}
	if row.Receipt != nil {
		receipt := *row.Receipt
		q.mu.Unlock()
		return receipt, nil
	}
	q.busy[key] = true
	row.Status = "uploading"
	row.Error = ""
	q.entries[key] = row
	q.mu.Unlock()
	receipt, e := upload(ctx, clone(row).Input)
	if e == nil && (receipt.OperationID != opid || receipt.FrozenDigest != row.Input.FrozenDigest || receipt.TargetID != row.Input.TargetID || receipt.RecordID != row.Input.TargetID || receipt.ResponsibleEndpoint != "agent" || receipt.Status != "recorded" || receipt.TargetKind != "history") {
		e = errors.New("invalid_response")
	}
	q.mu.Lock()
	defer q.mu.Unlock()
	delete(q.busy, key)
	// Retention may have changed while the upload was in flight. Never restore
	// ciphertext using the stale captured row after a session-only choice.
	current := q.entries[key]
	row.Persisted = current.Persisted
	row.LossRisk = current.LossRisk
	if e != nil {
		row.Status = "failed"
		row.Error = safe(e)
		if q.mode(uid) == "encrypted" {
			_ = q.persist(context.Background(), &row)
		}
		q.entries[key] = row
		return wire.RecordOperationReceipt{}, e
	}
	completed := row
	completed.Status = "recorded"
	completed.Receipt = &receipt
	completed.Error = ""
	completed.Input = wire.RecordUploadInput{ContractVersion: row.Input.ContractVersion, OperationID: opid, UserID: uid, ProjectID: pid, ConnectionID: row.Input.ConnectionID, TargetKind: "history", TargetID: row.Input.TargetID, ResponsibleEndpoint: "agent", FrozenDigest: row.Input.FrozenDigest}
	completed.Input.Snapshot = wire.ExecutionSnapshot{UserID: uid, ProjectID: pid, ConnectionID: row.Input.ConnectionID, TabID: row.Input.Snapshot.TabID, RunID: row.Input.Snapshot.RunID, Executor: "agent", RunStatus: row.Input.Snapshot.RunStatus, StartedAt: row.Input.Snapshot.StartedAt, FinishedAt: row.Input.Snapshot.FinishedAt}
	completed.Bytes = 0
	completed.LossRisk = false
	if q.mode(uid) == "encrypted" {
		e = q.persist(context.Background(), &completed)
	} else if row.Persisted {
		e = q.disk.Remove(file(row.Input))
		completed.Persisted = false
	}
	if e != nil {
		row.Status = "failed"
		row.Error = safe(e)
		row.LossRisk = true
		q.entries[key] = row
		return wire.RecordOperationReceipt{}, e
	}
	q.entries[key] = completed
	return receipt, nil
}
func (q *Queue) Discard(ctx context.Context, uid, pid, opid string) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	key := opid + "\x00" + uid
	row, ok := q.entries[key]
	if !ok || row.Input.ProjectID != pid {
		return ErrMissing
	}
	if q.busy[key] {
		return ErrBusy
	}
	if row.Persisted {
		if e := q.disk.Remove(file(row.Input)); e != nil {
			return e
		}
	}
	delete(q.entries, key)
	return nil
}
