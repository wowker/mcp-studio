package lifecycle

import (
	"fmt"
	"mcp-studio/internal/agent/process"
	"os"
	"path/filepath"
	"testing"
)

func TestReadOnlyMarkerFailureDoesNotLoseOldBinary(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	prefix := filepath.Join(root, "managed")
	state := filepath.Join(root, "state")
	source := filepath.Join(root, "candidate")
	os.WriteFile(source, []byte("version-one"), 0700)
	if err = Apply("install", prefix, state, source); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(source, []byte("version-two"), 0700)
	os.Chmod(filepath.Join(prefix, ".mcp-studio-managed.json"), 0400)
	if err = Apply("upgrade", prefix, state, source); err == nil {
		t.Fatal("read-only marker not rejected")
	}
	raw, _ := os.ReadFile(filepath.Join(prefix, BinaryName()))
	if string(raw) != "version-one" {
		t.Fatal("old binary lost after marker failure", string(raw))
	}
	guard, err := GuardRuntime(filepath.Join(prefix, BinaryName()), state)
	if err != nil {
		t.Fatal("failed upgrade broke runtime", err)
	}
	guard.Close()
	os.Chmod(filepath.Join(prefix, ".mcp-studio-managed.json"), 0600)
	if err = Apply("upgrade", prefix, state, source); err != nil {
		t.Fatal("cannot retry upgrade", err)
	}
}

func transactionFixture(t *testing.T) (string, string, string) {
	t.Helper()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	prefix, state, source := filepath.Join(root, "managed"), filepath.Join(root, "state"), filepath.Join(root, "candidate")
	os.WriteFile(source, []byte("version-one"), 0700)
	if err = Apply("install", prefix, state, source); err != nil {
		t.Fatal(err)
	}
	for _, n := range []string{"queue.enc", "vault.enc", "device-id"} {
		os.WriteFile(filepath.Join(state, n), []byte("retained"), 0600)
	}
	os.WriteFile(source, []byte("version-two"), 0700)
	return prefix, state, source
}
func assertOldAndState(t *testing.T, prefix, state string) {
	t.Helper()
	raw, _ := os.ReadFile(filepath.Join(prefix, BinaryName()))
	if string(raw) != "version-one" {
		t.Fatal("old binary not recovered", string(raw))
	}
	for _, n := range []string{"queue.enc", "vault.enc", "device-id"} {
		raw, _ = os.ReadFile(filepath.Join(state, n))
		if string(raw) != "retained" {
			t.Fatal("state changed", n)
		}
	}
}
func TestMarkerPublicationFailureRollsBackPair(t *testing.T) {
	prefix, state, source := transactionFixture(t)
	ops := systemOperations()
	rename := ops.rename
	ops.rename = func(from, to string) error {
		if to == filepath.Join(prefix, ".mcp-studio-managed.json") {
			return os.ErrPermission
		}
		return rename(from, to)
	}
	if apply("upgrade", prefix, state, source, ops) == nil {
		t.Fatal("injected marker failure ignored")
	}
	assertOldAndState(t, prefix, state)
	guard, err := GuardRuntime(filepath.Join(prefix, BinaryName()), state)
	if err != nil {
		t.Fatal("failed transaction broke runtime", err)
	}
	guard.Close()
	if err = Apply("upgrade", prefix, state, source); err != nil {
		t.Fatal("cannot retry", err)
	}
}
func TestInterruptedReplacementRecoversBeforeRuntimeAndHonorsStateLock(t *testing.T) {
	prefix, state, source := transactionFixture(t)
	ops := systemOperations()
	rename := ops.rename
	ops.rename = func(from, to string) error {
		err := rename(from, to)
		if err == nil && to == filepath.Join(prefix, BinaryName()) {
			panic("controlled installer interruption")
		}
		return err
	}
	func() {
		defer func() {
			if recover() == nil {
				t.Error("interruption not reached")
			}
		}()
		_ = apply("upgrade", prefix, state, source, ops)
	}()
	raw, _ := os.ReadFile(filepath.Join(prefix, BinaryName()))
	if string(raw) != "version-two" {
		t.Fatal("replacement interruption not exercised")
	}
	stateLock, err := process.Lock(filepath.Join(state, "agent.lock"))
	if err != nil {
		t.Fatal(err)
	}
	if guard, err := GuardRuntime(filepath.Join(prefix, BinaryName()), state); err == nil {
		if guard != nil {
			guard.Close()
		}
		t.Fatal("recovery bypassed running state lock")
	}
	stateLock.Close()
	if guard, err := GuardRuntime(filepath.Join(prefix, BinaryName()), state); err == nil {
		if guard != nil {
			guard.Close()
		}
		t.Fatal("recovered runtime must request restart")
	}
	assertOldAndState(t, prefix, state)
	guard, err := GuardRuntime(filepath.Join(prefix, BinaryName()), state)
	if err != nil {
		t.Fatal("recovery not restartable", err)
	}
	guard.Close()
	if err = Apply("upgrade", prefix, state, source); err != nil {
		t.Fatal("recovery not upgradeable", err)
	}
}
func TestUninstallPartialFailureAndInterruptionKeepRecoveryPath(t *testing.T) {
	for _, interrupted := range []bool{false, true} {
		t.Run(fmt.Sprint(interrupted), func(t *testing.T) {
			prefix, state, source := transactionFixture(t)
			ops := systemOperations()
			remove := ops.remove
			ops.remove = func(path string) error {
				if path == filepath.Join(prefix, ".mcp-studio-managed.json") {
					if interrupted {
						panic("controlled uninstall interruption")
					}
					return os.ErrPermission
				}
				return remove(path)
			}
			func() {
				defer func() {
					if interrupted && recover() == nil {
						t.Error("interruption not reached")
					}
				}()
				if apply("uninstall", prefix, state, source, ops) == nil {
					t.Error("partial uninstall ignored")
				}
			}()
			if interrupted {
				if err := Apply("upgrade", prefix, state, source); err != nil {
					t.Fatal("installer recovery failed", err)
				}
			} else {
				assertOldAndState(t, prefix, state)
			}
			if err := Apply("uninstall", prefix, state, source); err != nil {
				t.Fatal("cannot finish uninstall", err)
			}
			for _, n := range []string{"queue.enc", "vault.enc", "device-id"} {
				raw, _ := os.ReadFile(filepath.Join(state, n))
				if string(raw) != "retained" {
					t.Fatal("state changed", n)
				}
			}
		})
	}
}

func TestDurableCommitRecoveryKeepsNewPairAndFinishesUninstall(t *testing.T) {
	for _, action := range []string{"upgrade", "uninstall"} {
		t.Run(action, func(t *testing.T) {
			prefix, state, source := transactionFixture(t)
			ops := systemOperations()
			rename := ops.rename
			ops.rename = func(from, to string) error {
				err := rename(from, to)
				if err == nil && to == filepath.Join(prefix, transactionName, "committed") {
					panic("controlled post-commit interruption")
				}
				return err
			}
			func() {
				defer func() {
					if recover() == nil {
						t.Error("commit interruption not reached")
					}
				}()
				_ = apply(action, prefix, state, source, ops)
			}()
			if action == "uninstall" {
				if err := Apply("uninstall", prefix, state, source); err != nil {
					t.Fatal("cannot finish committed uninstall", err)
				}
			} else {
				if guard, err := GuardRuntime(filepath.Join(prefix, BinaryName()), state); err == nil {
					if guard != nil {
						guard.Close()
					}
					t.Fatal("recovery should require restart")
				}
				raw, _ := os.ReadFile(filepath.Join(prefix, BinaryName()))
				if string(raw) != "version-two" {
					t.Fatal("committed pair rolled back")
				}
				guard, err := GuardRuntime(filepath.Join(prefix, BinaryName()), state)
				if err != nil {
					t.Fatal("committed startup invalid", err)
				}
				guard.Close()
			}
			for _, n := range []string{"queue.enc", "vault.enc", "device-id"} {
				raw, _ := os.ReadFile(filepath.Join(state, n))
				if string(raw) != "retained" {
					t.Fatal("state changed", n)
				}
			}
		})
	}
}
func TestInterruptedInitialInstallCanRetryDedicatedPrefix(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	prefix, state, source := filepath.Join(root, "managed"), filepath.Join(root, "state"), filepath.Join(root, "candidate")
	os.WriteFile(source, []byte("version-one"), 0700)
	ops := systemOperations()
	rename := ops.rename
	ops.rename = func(from, to string) error {
		err := rename(from, to)
		if err == nil && to == filepath.Join(prefix, BinaryName()) {
			panic("controlled initial install interruption")
		}
		return err
	}
	func() {
		defer func() {
			if recover() == nil {
				t.Error("interruption not reached")
			}
		}()
		_ = apply("install", prefix, state, source, ops)
	}()
	if err := Apply("install", prefix, state, source); err != nil {
		t.Fatal("cannot retry interrupted install", err)
	}
	guard, err := GuardRuntime(filepath.Join(prefix, BinaryName()), state)
	if err != nil {
		t.Fatal(err)
	}
	guard.Close()
}
