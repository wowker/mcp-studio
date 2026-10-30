package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// B16: deviceIdentity owns the Agent's persistent device identity. It rejects
// symlink substitution, refuses a stored id that disagrees with an explicit
// request, and only ever creates the file with O_EXCL at 0600. These assertions
// pin those safety properties; a regression here is a device impersonation hole.

func TestDeviceIdentityCreatesStablePrivateIdentity(t *testing.T) {
	directory := t.TempDir()

	generated, err := deviceIdentity(directory, "")
	if err != nil {
		t.Fatalf("first call: %v", err)
	}
	if generated == "" {
		t.Fatal("generated device identity is empty")
	}

	info, err := os.Stat(filepath.Join(directory, "device-id"))
	if err != nil {
		t.Fatalf("identity file missing: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Errorf("identity file mode = %v, want 0600", info.Mode().Perm())
	}

	again, err := deviceIdentity(directory, "")
	if err != nil {
		t.Fatalf("second call: %v", err)
	}
	if again != generated {
		t.Errorf("identity not stable: %q then %q", generated, again)
	}
}

func TestDeviceIdentityAcceptsMatchingExplicitRequest(t *testing.T) {
	directory := t.TempDir()
	first, err := deviceIdentity(directory, "device_abc-123")
	if err != nil {
		t.Fatalf("create with explicit id: %v", err)
	}
	if first != "device_abc-123" {
		t.Errorf("explicit id not honored: %q", first)
	}
	if reused, err := deviceIdentity(directory, "device_abc-123"); err != nil || reused != first {
		t.Errorf("matching request rejected: %q, %v", reused, err)
	}
}

func TestDeviceIdentityRejectsMismatchedExplicitRequest(t *testing.T) {
	directory := t.TempDir()
	if _, err := deviceIdentity(directory, "stored-identity"); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if _, err := deviceIdentity(directory, "different-identity"); err == nil {
		t.Fatal("mismatched request must be rejected as device_identity_mismatch")
	}
}

func TestDeviceIdentityRejectsInvalidStoredIdentity(t *testing.T) {
	directory := t.TempDir()
	// Contains a space, which vault.ValidID rejects.
	if err := os.WriteFile(filepath.Join(directory, "device-id"), []byte("bad id\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := deviceIdentity(directory, ""); err == nil {
		t.Fatal("invalid stored identity must be rejected as device_identity_mismatch")
	}
}

func TestDeviceIdentityRejectsInvalidExplicitRequest(t *testing.T) {
	directory := t.TempDir()
	if _, err := deviceIdentity(directory, "bad/id"); err == nil {
		t.Fatal("invalid requested identity must be rejected as invalid_device_identity")
	}
	if _, err := os.Stat(filepath.Join(directory, "device-id")); !os.IsNotExist(err) {
		t.Fatal("rejected identity must not be persisted")
	}
}

func TestDeviceIdentityRejectsSymlinkSubstitution(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(t.TempDir(), "attacker-controlled")
	if err := os.WriteFile(target, []byte("attacker-identity\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(directory, "device-id")); err != nil {
		t.Skipf("symlink unsupported: %v", err)
	}
	_, err := deviceIdentity(directory, "")
	if err == nil || !strings.Contains(err.Error(), "unsafe_device_identity") {
		t.Fatalf("symlink must be rejected as unsafe_device_identity, got %v", err)
	}
}

func TestDeviceIdentityRejectsUnreadableEntry(t *testing.T) {
	directory := t.TempDir()
	// A directory where the identity file should be: ReadFile fails with
	// something other than ErrNotExist, so identity must stay unavailable.
	if err := os.Mkdir(filepath.Join(directory, "device-id"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := deviceIdentity(directory, ""); err == nil {
		t.Fatal("directory entry must be rejected as device_identity_unavailable")
	}
}
