// Package vault keeps master keys in the OS credential store and ciphertext in
// a separately owned, confined directory. Session values never touch the disk.
package vault

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var ErrUnavailable = errors.New("vault_unavailable")
var ErrKeyMissing = errors.New("vault_key_missing")
var ErrKeyExists = errors.New("vault_key_exists")
var ErrMissing = errors.New("credential_missing")
var ErrExpired = errors.New("credential_expired")
var ErrUnsafePath = errors.New("unsafe_storage_path")
var ErrCorrupt = errors.New("encrypted_data_corrupt")

type MasterStore interface {
	Read(context.Context, string) ([]byte, error)
	Create(context.Context, string, []byte) error
	Delete(context.Context, string) error
}

// Disk exposes only derived relative filenames; it cannot address parent files.
type Disk struct {
	root   *os.Root
	device string
	keys   MasterStore
	mu     sync.Mutex
}

// The vault and queue use independent confined Disk handles but share one OS
// master key. Serialize initialization across those handles, including stores
// whose native create operation is a read followed by a write.
var masterInitialization sync.Mutex

func OpenDisk(root, device string, keys MasterStore) (*Disk, error) {
	if !filepath.IsAbs(root) || !ValidID(device) || keys == nil {
		return nil, ErrUnsafePath
	}
	if info, err := os.Lstat(root); err == nil && (info.Mode()&os.ModeSymlink != 0 || !info.IsDir()) {
		return nil, ErrUnsafePath
	}
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, ErrUnavailable
	}
	r, err := os.OpenRoot(root)
	if err != nil {
		return nil, ErrUnsafePath
	}
	ok := false
	defer func() {
		if !ok {
			r.Close()
		}
	}()
	marker, err := r.ReadFile(".agent-owner")
	if errors.Is(err, os.ErrNotExist) {
		dir, e := r.Open(".")
		if e != nil {
			return nil, ErrUnsafePath
		}
		entries, e := dir.ReadDir(-1)
		dir.Close()
		if e != nil || len(entries) != 0 {
			return nil, ErrUnsafePath
		}
		f, e := r.OpenFile(".agent-owner", os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if e != nil {
			return nil, ErrUnsafePath
		}
		_, e = f.WriteString(device)
		if e == nil {
			e = f.Sync()
		}
		f.Close()
		if e != nil {
			return nil, ErrUnavailable
		}
	} else if err != nil || string(marker) != device {
		return nil, ErrUnsafePath
	}
	ok = true
	return &Disk{root: r, device: device, keys: keys}, nil
}
func ValidID(s string) bool {
	if len(s) < 1 || len(s) > 128 {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '_' || c == '-') {
			return false
		}
	}
	return true
}
func Hash(b []byte) string   { sum := sha256.Sum256(b); return hex.EncodeToString(sum[:]) }
func (d *Disk) Close() error { return d.root.Close() }
func (d *Disk) key(ctx context.Context) ([]byte, error) {
	masterInitialization.Lock()
	defer masterInitialization.Unlock()
	id := "mcp-studio-agent-master:" + d.device
	k, err := d.keys.Read(ctx, id)
	if errors.Is(err, ErrKeyMissing) {
		if _, e := d.root.Stat(".key-established"); !errors.Is(e, os.ErrNotExist) {
			return nil, ErrUnavailable
		}
		k = make([]byte, 32)
		if _, err = rand.Read(k); err != nil {
			return nil, ErrUnavailable
		}
		if err = d.keys.Create(ctx, id, k); err != nil && !errors.Is(err, ErrKeyExists) {
			return nil, ErrUnavailable
		}
		k, err = d.keys.Read(ctx, id)
	}
	if err != nil || len(k) != 32 {
		return nil, ErrUnavailable
	}
	if _, err = d.root.Stat(".key-established"); errors.Is(err, os.ErrNotExist) {
		if err = d.root.WriteFile(".key-established", []byte(d.device), 0600); err != nil {
			return nil, ErrUnavailable
		}
	}
	return k, nil
}
func (d *Disk) Available(ctx context.Context) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	_, err := d.key(ctx)
	return err == nil
}
func (d *Disk) aead(ctx context.Context) (cipher.AEAD, error) {
	k, err := d.key(ctx)
	if err != nil {
		return nil, err
	}
	defer clear(k)
	block, err := aes.NewCipher(k)
	if err != nil {
		return nil, ErrUnavailable
	}
	return cipher.NewGCM(block)
}
func (d *Disk) valid(name string) bool {
	return !strings.Contains(name, "..") && !strings.ContainsAny(name, "/\\") && len(name) <= 160 && len(name) > 0 && name[0] != '.'
}
func (d *Disk) Write(ctx context.Context, name string, aad, body []byte) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if !d.valid(name) {
		return ErrUnsafePath
	}
	a, err := d.aead(ctx)
	if err != nil {
		return err
	}
	nonce := make([]byte, a.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return ErrUnavailable
	}
	sealed := append([]byte{1}, nonce...)
	sealed = a.Seal(sealed, nonce, body, append([]byte("mcp-studio.agent.v1|"+d.device+"|"), aad...))
	tmp := "write-" + Hash(nonce) + ".tmp"
	f, err := d.root.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return ErrUnavailable
	}
	defer d.root.Remove(tmp)
	if _, err = f.Write(sealed); err == nil {
		err = f.Sync()
	}
	if e := f.Close(); err == nil {
		err = e
	}
	if err != nil {
		return ErrUnavailable
	}
	if err = d.root.Rename(tmp, name); err != nil {
		return ErrUnavailable
	}
	dir, err := d.root.Open(".")
	if err == nil {
		err = dir.Sync()
		dir.Close()
	}
	if err != nil {
		return ErrUnavailable
	}
	return nil
}
func (d *Disk) Read(ctx context.Context, name string, aad []byte) ([]byte, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if !d.valid(name) {
		return nil, ErrUnsafePath
	}
	info, err := d.root.Lstat(name)
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrMissing
	}
	if err != nil || !info.Mode().IsRegular() || info.Size() > 40<<20 {
		return nil, ErrCorrupt
	}
	raw, err := d.root.ReadFile(name)
	if err != nil {
		return nil, ErrUnavailable
	}
	a, err := d.aead(ctx)
	if err != nil {
		return nil, err
	}
	if len(raw) < 1+a.NonceSize()+a.Overhead() || raw[0] != 1 {
		return nil, ErrCorrupt
	}
	nonce := raw[1 : 1+a.NonceSize()]
	body, err := a.Open(nil, nonce, raw[1+a.NonceSize():], append([]byte("mcp-studio.agent.v1|"+d.device+"|"), aad...))
	if err != nil {
		return nil, ErrCorrupt
	}
	return body, nil
}
func (d *Disk) Remove(name string) error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if !d.valid(name) {
		return ErrUnsafePath
	}
	if err := d.root.Remove(name); err != nil && !errors.Is(err, os.ErrNotExist) {
		return ErrUnavailable
	}
	return nil
}
func (d *Disk) Names(prefix string) ([]string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	f, err := d.root.Open(".")
	if err != nil {
		return nil, ErrUnavailable
	}
	defer f.Close()
	entries, err := f.ReadDir(-1)
	if err != nil {
		return nil, ErrUnavailable
	}
	names := []string{}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), prefix) && strings.HasSuffix(e.Name(), ".bin") {
			if !e.Type().IsRegular() {
				return nil, ErrCorrupt
			}
			names = append(names, e.Name())
		}
	}
	return names, nil
}
