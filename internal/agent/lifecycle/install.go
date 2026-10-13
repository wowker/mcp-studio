// Package lifecycle manages only a private, explicitly selected installation.
// It never deletes Agent state or accesses the system credential store.
package lifecycle

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mcp-studio/internal/agent/process"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
)

type marker struct {
	Format string `json:"format"`
	Owner  string `json:"owner"`
	State  string `json:"stateDirectory"`
	SHA256 string `json:"binarySHA256"`
}

func BinaryName() string {
	if runtime.GOOS == "windows" {
		return "mcp-studio-agent.exe"
	}
	return "mcp-studio-agent"
}
func safePath(path string) error {
	if !filepath.IsAbs(path) || filepath.Clean(path) != path || filepath.Dir(path) == path {
		return errors.New("unsafe_install_path")
	}
	for p := path; ; p = filepath.Dir(p) {
		info, err := os.Lstat(p)
		if err != nil && !os.IsNotExist(err) {
			return errors.New("unsafe_install_path")
		}
		if err == nil && (info.Mode()&os.ModeSymlink != 0 || !info.IsDir()) {
			return errors.New("unsafe_install_path")
		}
		if filepath.Dir(p) == p {
			break
		}
	}
	return nil
}
func regular(path string) error {
	i, e := os.Lstat(path)
	if e != nil || !i.Mode().IsRegular() {
		return errors.New("unsafe_install_file")
	}
	return nil
}
func hash(path string) (string, error) {
	if e := regular(path); e != nil {
		return "", e
	}
	f, e := os.Open(path)
	if e != nil {
		return "", errors.New("install_file_unavailable")
	}
	defer f.Close()
	h := sha256.New()
	if _, e = io.Copy(h, f); e != nil {
		return "", errors.New("install_file_unavailable")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func Apply(action, prefix, state, source string) error {
	return apply(action, prefix, state, source, systemOperations())
}
func apply(action, prefix, state, source string, ops operations) error {
	if action != "install" && action != "upgrade" && action != "uninstall" {
		return errors.New("invalid_install_action")
	}
	if err := safePath(prefix); err != nil {
		return err
	}
	if err := safePath(state); err != nil {
		return err
	}
	rel, _ := filepath.Rel(prefix, state)
	other, _ := filepath.Rel(state, prefix)
	if rel == "." || rel != ".." && !isOutside(rel) || other == "." || other != ".." && !isOutside(other) {
		return errors.New("state_and_install_must_be_separate")
	}
	current, err := user.Current()
	if err != nil {
		return errors.New("install_owner_unavailable")
	}
	reused := false
	if action == "install" {
		if err = os.Mkdir(prefix, 0700); err != nil {
			if _, e := os.Lstat(filepath.Join(prefix, transactionName)); !os.IsExist(err) || e != nil {
				return errors.New("install_prefix_must_be_new")
			}
			reused = true
		}
	}
	if err = safePath(prefix); err != nil {
		return err
	}
	if err = privateDirectory(prefix); err != nil {
		return err
	}
	lock, err := process.Lock(filepath.Join(prefix, ".install.lock"))
	if err != nil {
		return errors.New("install_in_progress")
	}
	defer lock.Close()
	// Both publication and recovery are serialized against the production Agent.
	if err = os.MkdirAll(state, 0700); err != nil {
		return errors.New("state_directory_unavailable")
	}
	if err = privateDirectory(state); err != nil {
		return err
	}
	stopped, err := process.Lock(filepath.Join(state, "agent.lock"))
	if err != nil {
		return errors.New("agent_must_be_stopped")
	}
	defer stopped.Close()
	recovered, initial, err := recoverTransaction(prefix, state)
	if err != nil {
		return err
	}
	if recovered && action == "uninstall" && verifyPair(prefix, nil) == nil {
		return nil
	}
	if reused && !initial {
		return errors.New("install_prefix_must_be_new")
	}
	expected := marker{Format: "mcp-studio-agent.install.v1", Owner: current.Uid, State: state}
	var before *marker
	if action != "install" {
		existing, e := readMarker(filepath.Join(prefix, markerName), current.Uid, state)
		if e != nil {
			return e
		}
		sum, e := hash(filepath.Join(prefix, BinaryName()))
		if e != nil || sum != existing.SHA256 {
			return errors.New("installed_binary_modified")
		}
		info, e := os.Lstat(filepath.Join(prefix, markerName))
		if e != nil || info.Mode().Perm()&0200 == 0 {
			return errors.New("marker_write_failed")
		}
		before = &existing
	}
	entries, err := os.ReadDir(prefix)
	if err != nil {
		return errors.New("install_prefix_unavailable")
	}
	for _, entry := range entries {
		n := entry.Name()
		if n != ".install.lock" && n != markerName && n != BinaryName() {
			return errors.New("unexpected_install_file")
		}
	}
	if action == "uninstall" {
		return publishTransaction(action, prefix, state, source, before, nil, ops)
	}
	expected.SHA256, err = hash(source)
	if err != nil {
		return err
	}
	return publishTransaction(action, prefix, state, source, before, &expected, ops)
}
func isOutside(rel string) bool { return len(rel) > 3 && rel[:3] == ".."+string(filepath.Separator) }

func privateDirectory(path string) error {
	info, err := os.Lstat(path)
	if err != nil || !info.IsDir() || runtime.GOOS != "windows" && info.Mode().Perm()&0077 != 0 {
		return errors.New("private_directory_required")
	}
	return nil
}

// GuardRuntime holds the managed installation lock for the whole process lifetime.
// This closes the gap between validating its state directory and locking state.
// Unmanaged, extracted candidates retain the existing explicit state-dir behavior.
func GuardRuntime(executable, state string) (*process.FileLock, error) {
	prefix := filepath.Dir(executable)
	path := filepath.Join(prefix, markerName)
	if _, err := os.Lstat(path); os.IsNotExist(err) {
		if _, e := os.Lstat(filepath.Join(prefix, transactionName)); os.IsNotExist(e) {
			return nil, nil
		}
	}
	if err := safePath(prefix); err != nil {
		return nil, err
	}
	if err := privateDirectory(prefix); err != nil {
		return nil, err
	}
	lock, err := process.Lock(filepath.Join(prefix, ".install.lock"))
	if err != nil {
		return nil, errors.New("managed_install_in_use")
	}
	fail := func() (*process.FileLock, error) { lock.Close(); return nil, errors.New("managed_startup_mismatch") }
	if _, e := os.Lstat(filepath.Join(prefix, transactionName)); os.IsNotExist(e) {
		owner, e := user.Current()
		if e != nil {
			return fail()
		}
		if _, e = readMarker(path, owner.Uid, state); e != nil {
			return fail()
		}
	}

	if err := safePath(state); err != nil {
		lock.Close()
		return nil, err
	}
	if err := privateDirectory(state); err != nil {
		lock.Close()
		return nil, err
	}
	stopped, err := process.Lock(filepath.Join(state, "agent.lock"))
	if err != nil {
		lock.Close()
		return nil, errors.New("agent_must_be_stopped")
	}
	recovered, _, recoverErr := recoverTransaction(prefix, state)
	stopped.Close()
	if recoverErr != nil {
		lock.Close()
		return nil, recoverErr
	}
	if recovered {
		lock.Close()
		return nil, errors.New("install_recovered_restart_required")
	}

	if err = regular(path); err != nil {
		return fail()
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return fail()
	}
	var m marker
	current, err := user.Current()
	if err != nil {
		return fail()
	}
	if json.Unmarshal(raw, &m) != nil || m.Format != "mcp-studio-agent.install.v1" || m.Owner != current.Uid || m.State != state {
		return fail()
	}
	sum, err := hash(executable)
	if err != nil || sum != m.SHA256 {
		return fail()
	}
	return lock, nil
}
