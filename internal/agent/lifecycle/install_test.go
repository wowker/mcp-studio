package lifecycle

import (
	"mcp-studio/internal/agent/process"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestManagedInstallUpgradeUninstallPreservesState(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	prefix := filepath.Join(root, "install")
	state := filepath.Join(root, "state")
	source := filepath.Join(root, "candidate")
	os.WriteFile(source, []byte("version-one"), 0700)
	if err := Apply("install", prefix, state, source); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"queue.enc", "device-id", "vault.enc"} {
		os.WriteFile(filepath.Join(state, name), []byte("retained"), 0600)
	}
	os.WriteFile(source, []byte("version-two"), 0700)
	lock, err := process.Lock(filepath.Join(state, "agent.lock"))
	if err != nil {
		t.Fatal(err)
	}
	if err := Apply("upgrade", prefix, state, source); err == nil {
		t.Fatal("upgraded running Agent")
	}
	lock.Close()
	if err := Apply("upgrade", prefix, state, source); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(filepath.Join(prefix, BinaryName()))
	if string(raw) != "version-two" {
		t.Fatal("binary not upgraded")
	}
	if err := Apply("uninstall", prefix, state, source); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(prefix, BinaryName())); !os.IsNotExist(err) {
		t.Fatal("binary remains")
	}
	for _, name := range []string{"queue.enc", "device-id", "vault.enc"} {
		raw, _ := os.ReadFile(filepath.Join(state, name))
		if string(raw) != "retained" {
			t.Fatal("state removed", name)
		}
	}
}

func TestRejectsUnmanagedSymlinkAndStateMismatch(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(root, "candidate")
	os.WriteFile(source, []byte("candidate"), 0700)
	prefix := filepath.Join(root, "unmanaged")
	os.Mkdir(prefix, 0700)
	os.WriteFile(filepath.Join(prefix, "mine"), []byte("untouched"), 0600)
	if Apply("install", prefix, filepath.Join(root, "state"), source) == nil {
		t.Fatal("overwrote unmanaged directory")
	}
	os.Symlink(prefix, filepath.Join(root, "link"))
	if Apply("install", filepath.Join(root, "link", "child"), filepath.Join(root, "state"), source) == nil {
		t.Fatal("accepted symlink ancestor")
	}
	if Apply("install", "relative", filepath.Join(root, "state"), source) == nil {
		t.Fatal("accepted relative prefix")
	}
	prefix = filepath.Join(root, "managed")
	state := filepath.Join(root, "state")
	if err := Apply("install", prefix, state, source); err != nil {
		t.Fatal(err)
	}
	if Apply("upgrade", prefix, filepath.Join(root, "other-state"), source) == nil {
		t.Fatal("bypassed state lock")
	}
	os.Remove(filepath.Join(prefix, BinaryName()))
	os.Symlink(source, filepath.Join(prefix, BinaryName()))
	if Apply("upgrade", prefix, state, source) == nil {
		t.Fatal("replaced symlink")
	}
}

func TestRejectsTamperedBinaryAndPreservesCandidateOnBusyInstall(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	prefix := filepath.Join(root, "managed")
	state := filepath.Join(root, "state")
	source := filepath.Join(root, "candidate")
	os.WriteFile(source, []byte("candidate"), 0700)
	if err = Apply("install", prefix, state, source); err != nil {
		t.Fatal(err)
	}
	lock, err := process.Lock(filepath.Join(prefix, ".install.lock"))
	if err != nil {
		t.Fatal(err)
	}
	if Apply("upgrade", prefix, state, source) == nil {
		t.Fatal("concurrent replacement accepted")
	}
	lock.Close()
	os.WriteFile(filepath.Join(prefix, BinaryName()), []byte("tampered"), 0700)
	if Apply("uninstall", prefix, state, source) == nil {
		t.Fatal("removed unmanaged binary")
	}
	raw, _ := os.ReadFile(filepath.Join(prefix, BinaryName()))
	if string(raw) != "tampered" {
		t.Fatal("tampered binary overwritten")
	}
}

func TestRejectsPublicManagedPrefix(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("native ACL validation remains pending")
	}
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	prefix := filepath.Join(root, "managed")
	state := filepath.Join(root, "state")
	source := filepath.Join(root, "candidate")
	os.WriteFile(source, []byte("candidate"), 0700)
	if err = Apply("install", prefix, state, source); err != nil {
		t.Fatal(err)
	}
	os.Chmod(prefix, 0777)
	if Apply("upgrade", prefix, state, source) == nil {
		t.Fatal("accepted public writable managed prefix")
	}
}

func TestManagedStartupCannotBypassRegisteredStateLock(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	prefix := filepath.Join(root, "managed")
	state := filepath.Join(root, "state")
	source := filepath.Join(root, "candidate")
	os.WriteFile(source, []byte("candidate"), 0700)
	if err = Apply("install", prefix, state, source); err != nil {
		t.Fatal(err)
	}
	guard, err := GuardRuntime(filepath.Join(prefix, BinaryName()), state)
	if err != nil {
		t.Fatal(err)
	}
	if Apply("upgrade", prefix, state, source) == nil {
		t.Fatal("replaced running managed binary")
	}
	guard.Close()
	other := filepath.Join(root, "other-state")
	if guard, err = GuardRuntime(filepath.Join(prefix, BinaryName()), other); err == nil {
		if guard != nil {
			guard.Close()
		}
		t.Fatal("bypassed managed state lock")
	}
	if _, err = os.Stat(other); !os.IsNotExist(err) {
		t.Fatal("startup check created state")
	}
	if guard, err = GuardRuntime(source, other); err != nil || guard != nil {
		t.Fatal("unmanaged candidate cannot launch", err)
	}
}
