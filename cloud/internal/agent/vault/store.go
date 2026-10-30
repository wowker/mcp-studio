package vault

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"
)

type Scope struct {
	UserID       string `json:"userId"`
	ProjectID    string `json:"projectId"`
	ConnectionID string `json:"connectionId"`
	Kind         string `json:"kind"`
	ReferenceID  string `json:"referenceId"`
}
type Value struct {
	ValueJSON string `json:"valueJSON"`
	ExpiresAt string `json:"expiresAt"`
}
type Store struct {
	disk      *Disk
	mu        sync.Mutex
	memory    map[string]Value
	locations map[string]string
	Now       func() time.Time
}

func NewStore(root, device string, keys MasterStore) (*Store, error) {
	d, e := OpenDisk(root, device, keys)
	if e != nil {
		return nil, e
	}
	return &Store{disk: d, memory: map[string]Value{}, locations: map[string]string{}, Now: time.Now}, nil
}
func (v *Store) Close() error    { return v.disk.Close() }
func (v *Store) Available() bool { return v.disk.Available(context.Background()) }
func scopeKey(s Scope) (string, []byte, error) {
	if !ValidID(s.UserID) || !ValidID(s.ProjectID) || !ValidID(s.ConnectionID) || s.Kind != "token" && s.Kind != "oauth" && s.Kind != "variable" || s.Kind == "variable" && !ValidID(s.ReferenceID) || s.ReferenceID != "" && !ValidID(s.ReferenceID) {
		return "", nil, errors.New("invalid_credential_scope")
	}
	aad, _ := json.Marshal(s)
	return "credential-" + Hash(aad) + ".bin", aad, nil
}
func (v *Store) Save(ctx context.Context, s Scope, value Value, retention string) error {
	name, aad, e := scopeKey(s)
	if e != nil {
		return e
	}
	if len(value.ValueJSON) > 1<<20 || !json.Valid([]byte(value.ValueJSON)) || retention != "session" && retention != "local" {
		return errors.New("invalid_credential")
	}
	if value.ExpiresAt != "" {
		expiry, e := time.Parse(time.RFC3339Nano, value.ExpiresAt)
		if e != nil || !v.Now().Before(expiry) {
			return ErrExpired
		}
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if retention == "local" {
		b, _ := json.Marshal(value)
		if e = v.disk.Write(ctx, name, aad, b); e != nil {
			return e
		}
	} else if e = v.disk.Remove(name); e != nil {
		// Session-only replaces the durable credential too. Do not report a
		// retention change until the previous ciphertext has been removed.
		return e
	}
	v.memory[name] = value
	v.locations[name] = retention
	return nil
}
func (v *Store) Get(ctx context.Context, s Scope) (Value, error) {
	name, aad, e := scopeKey(s)
	if e != nil {
		return Value{}, e
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	value, ok := v.memory[name]
	if !ok {
		b, e := v.disk.Read(ctx, name, aad)
		if e != nil {
			return Value{}, e
		}
		if e = json.Unmarshal(b, &value); e != nil || !json.Valid([]byte(value.ValueJSON)) {
			return Value{}, ErrCorrupt
		}
	}
	if value.ExpiresAt != "" {
		expiry, e := time.Parse(time.RFC3339Nano, value.ExpiresAt)
		if e != nil {
			return Value{}, ErrCorrupt
		}
		if !v.Now().Before(expiry) {
			return Value{}, ErrExpired
		}
	}
	return value, nil
}
func (v *Store) Status(ctx context.Context, s Scope) (string, bool, error) {
	name, _, e := scopeKey(s)
	if e != nil {
		return "none", false, e
	}
	_, e = v.Get(ctx, s)
	if errors.Is(e, ErrMissing) {
		return "none", false, nil
	}
	if e != nil {
		return "none", false, e
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	location := v.locations[name]
	if location == "" {
		location = "local"
	}
	return location, true, nil
}
func (v *Store) Delete(ctx context.Context, s Scope) error {
	name, _, e := scopeKey(s)
	if e != nil {
		return e
	}
	v.mu.Lock()
	defer v.mu.Unlock()
	if e = v.disk.Remove(name); e != nil {
		return e
	}
	delete(v.memory, name)
	delete(v.locations, name)
	return nil
}
func (v *Store) ClearMemory() { v.mu.Lock(); defer v.mu.Unlock(); clear(v.memory); clear(v.locations) }
