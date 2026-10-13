package vault

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

type testKeys struct {
	mu   sync.Mutex
	key  []byte
	fail bool
}

func (k *testKeys) Read(context.Context, string) ([]byte, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.fail {
		return nil, ErrUnavailable
	}
	if k.key == nil {
		return nil, ErrKeyMissing
	}
	return append([]byte(nil), k.key...), nil
}
func (k *testKeys) Create(_ context.Context, _ string, key []byte) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.fail {
		return ErrUnavailable
	}
	if k.key != nil {
		return ErrKeyExists
	}
	k.key = append([]byte(nil), key...)
	return nil
}
func (k *testKeys) Delete(context.Context, string) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.key = nil
	return nil
}
func TestEncryptedCredentialsScopeRestartAndDelete(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	keys := &testKeys{}
	v, err := NewStore(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	defer v.Close()
	s := Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "token"}
	value := Value{ValueJSON: `"private-fixture-value"`}
	if err = v.Save(ctx, s, value, "local"); err != nil {
		t.Fatal(err)
	}
	_ = filepath.Walk(root, func(p string, i os.FileInfo, e error) error {
		if e == nil && !i.IsDir() {
			b, _ := os.ReadFile(p)
			if bytes.Contains(b, []byte("private-fixture-value")) || bytes.Contains(b, keys.key) {
				t.Fatal("plaintext on disk")
			}
		}
		return nil
	})
	other := s
	other.ConnectionID = "other"
	if _, err = v.Get(ctx, other); !errors.Is(err, ErrMissing) {
		t.Fatal("cross connection read", err)
	}
	restarted, err := NewStore(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	got, err := restarted.Get(ctx, s)
	if err != nil || got != value {
		t.Fatal(got, err)
	}
	if err = restarted.Delete(ctx, s); err != nil {
		t.Fatal(err)
	}
	if _, err = restarted.Get(ctx, s); !errors.Is(err, ErrMissing) {
		t.Fatal("delete failed")
	}
}
func TestVaultUnavailableDoesNotEraseAuthorizedSessionOrRecreateLostKey(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	keys := &testKeys{fail: true}
	v, err := NewStore(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	defer v.Close()
	s := Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "token"}
	value := Value{ValueJSON: `"session-fixture"`}
	if err = v.Save(ctx, s, value, "session"); err != nil {
		t.Fatal(err)
	}
	if err = v.Save(ctx, s, value, "local"); !errors.Is(err, ErrUnavailable) {
		t.Fatal("false local success", err)
	}
	if got, err := v.Get(ctx, s); err != nil || got != value {
		t.Fatal("lost authorization", err)
	}
	keys.fail = false
	if err = v.Save(ctx, s, value, "local"); err != nil {
		t.Fatal(err)
	}
	keys.key = nil
	lost, err := NewStore(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	defer lost.Close()
	if _, err = lost.Get(ctx, s); !errors.Is(err, ErrUnavailable) {
		t.Fatal("lost key silently replaced", err)
	}
	if keys.key != nil {
		t.Fatal("replacement key created")
	}
}
func TestVaultRejectsForeignRootAndSymlink(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "foreign"), []byte("other"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewStore(root, "device", &testKeys{}); !errors.Is(err, ErrUnsafePath) {
		t.Fatal("foreign directory adopted", err)
	}
	base := t.TempDir()
	target := t.TempDir()
	link := filepath.Join(base, "link")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	if _, err := NewStore(link, "device", &testKeys{}); !errors.Is(err, ErrUnsafePath) {
		t.Fatal("symlink adopted", err)
	}
}

func TestSessionReplacementCannotResurrectLocalCredential(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	keys := &testKeys{}
	v, err := NewStore(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	s := Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "token"}
	if err = v.Save(ctx, s, Value{ValueJSON: `"old-local"`}, "local"); err != nil {
		t.Fatal(err)
	}
	if err = v.Save(ctx, s, Value{ValueJSON: `"new-session"`}, "session"); err != nil {
		t.Fatal(err)
	}
	if location, present, err := v.Status(ctx, s); err != nil || !present || location != "session" {
		t.Fatal(location, present, err)
	}
	v.Close()
	restarted, err := NewStore(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	defer restarted.Close()
	if _, err = restarted.Get(ctx, s); !errors.Is(err, ErrMissing) {
		t.Fatal("previous local credential resurrected", err)
	}
}

func TestCiphertextAuthenticationNonceAndScopedCleanupFailure(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	v, err := NewStore(root, "device", &testKeys{})
	if err != nil {
		t.Fatal(err)
	}
	defer v.Close()
	s := Scope{UserID: "u", ProjectID: "p", ConnectionID: "c", Kind: "token"}
	val := Value{ValueJSON: `"first-value"`}
	if err = v.Save(ctx, s, val, "local"); err != nil {
		t.Fatal(err)
	}
	name, aad, _ := scopeKey(s)
	path := filepath.Join(root, name)
	first, _ := os.ReadFile(path)
	if err = v.Save(ctx, s, val, "local"); err != nil {
		t.Fatal(err)
	}
	second, _ := os.ReadFile(path)
	if bytes.Equal(first, second) {
		t.Fatal("nonce reused")
	}
	if _, err = v.disk.Read(ctx, name, []byte("other scope")); !errors.Is(err, ErrCorrupt) {
		t.Fatal("AAD ignored", err)
	}
	changed := append([]byte(nil), second...)
	changed[len(changed)-1] ^= 1
	if err = os.WriteFile(path, changed, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = v.disk.Read(ctx, name, aad); !errors.Is(err, ErrCorrupt) {
		t.Fatal("tampering accepted", err)
	}
	if err = os.Remove(path); err != nil {
		t.Fatal(err)
	}
	if err = os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(filepath.Join(path, "prevent-cleanup"), []byte("safe"), 0600); err != nil {
		t.Fatal(err)
	}
	if err = v.Save(ctx, s, Value{ValueJSON: `"replacement"`}, "session"); !errors.Is(err, ErrUnavailable) {
		t.Fatal("false session retention", err)
	}
	if got, err := v.Get(ctx, s); err != nil || got != val {
		t.Fatal("failed cleanup changed authorized session", got, err)
	}
}

// Some native stores have read-then-write creation rather than insert-if-absent.
// Independent vault/queue Disk instances must initialize a device key once.
type nonAtomicKeys struct {
	testKeys
	creates int
}

func (k *nonAtomicKeys) Create(_ context.Context, _ string, key []byte) error {
	time.Sleep(15 * time.Millisecond)
	k.mu.Lock()
	defer k.mu.Unlock()
	k.creates++
	k.key = append([]byte(nil), key...)
	return nil
}
func TestIndependentDisksSerializeMasterInitialization(t *testing.T) {
	keys := &nonAtomicKeys{}
	root := t.TempDir()
	first, err := OpenDisk(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := OpenDisk(root, "device", keys)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	start := make(chan struct{})
	var wg sync.WaitGroup
	for _, d := range []*Disk{first, second} {
		wg.Add(1)
		go func(d *Disk) {
			defer wg.Done()
			<-start
			if !d.Available(context.Background()) {
				t.Error("key unavailable")
			}
		}(d)
	}
	close(start)
	wg.Wait()
	if keys.creates != 1 {
		t.Fatal("overwritten master during concurrent initialization", keys.creates)
	}
}
