package lifecycle

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/user"
	"path/filepath"
	"runtime"
)

const transactionName = ".install-transaction"
const markerName = ".mcp-studio-managed.json"

type operations struct {
	rename func(string, string) error
	remove func(string) error
}

func systemOperations() operations { return operations{os.Rename, os.Remove} }

type transaction struct {
	Format          string  `json:"format"`
	Action          string  `json:"action"`
	Owner           string  `json:"owner"`
	State           string  `json:"stateDirectory"`
	Before          *marker `json:"before"`
	After           *marker `json:"after"`
	BeforeMarkerSHA string  `json:"beforeMarkerSHA256"`
}

func syncDirectory(path string) error {
	// Windows file flushes are used; directory durability needs native verification.
	if runtime.GOOS == "windows" {
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return f.Sync()
}
func writeNew(path string, raw []byte, mode os.FileMode) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	_, err = f.Write(raw)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	return closeErr
}
func copyNew(source, target string, mode os.FileMode) error {
	if err := regular(source); err != nil {
		return err
	}
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	if err == nil {
		err = out.Sync()
	}
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}
func readMarker(path, owner, state string) (marker, error) {
	var m marker
	if err := regular(path); err != nil {
		return m, errors.New("unmanaged_install")
	}
	raw, err := os.ReadFile(path)
	if err != nil || json.Unmarshal(raw, &m) != nil {
		return m, errors.New("unmanaged_install")
	}
	if m.Format != "mcp-studio-agent.install.v1" || m.Owner != owner || m.State != state {
		return m, errors.New("install_owner_or_state_mismatch")
	}
	return m, nil
}
func verifyPair(prefix string, want *marker) error {
	binary, path := filepath.Join(prefix, BinaryName()), filepath.Join(prefix, markerName)
	if want == nil {
		for _, p := range []string{binary, path} {
			if _, err := os.Lstat(p); !os.IsNotExist(err) {
				return errors.New("transaction_pair_mismatch")
			}
		}
		return nil
	}
	got, err := readMarker(path, want.Owner, want.State)
	if err != nil || got != *want {
		return errors.New("transaction_pair_mismatch")
	}
	sum, err := hash(binary)
	if err != nil || sum != want.SHA256 {
		return errors.New("transaction_pair_mismatch")
	}
	return nil
}
func transactionFiles(dir string) ([]os.DirEntry, error) {
	if err := safePath(dir); err != nil {
		return nil, err
	}
	if err := privateDirectory(dir); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	allowed := map[string]bool{"journal.json": true, "journal-pending": true, "before-binary": true, "before-marker": true, "after-binary": true, "after-marker": true, "commit-pending": true, "committed": true, "restore-binary": true, "restore-marker": true, "rollback-pending": true, "rolled-back": true}
	for _, entry := range entries {
		if !allowed[entry.Name()] || regular(filepath.Join(dir, entry.Name())) != nil {
			return nil, errors.New("unsafe_install_transaction")
		}
	}
	return entries, nil
}
func cleanupTransaction(dir string) error {
	entries, err := transactionFiles(dir)
	if err != nil {
		return err
	}
	// Keep committed + journal until backup cleanup is done. After journal removal
	// no further rollback is possible or required; a leftover directory is staging.
	for _, e := range entries {
		if e.Name() != "journal.json" && e.Name() != "committed" && e.Name() != "rolled-back" {
			if err = os.Remove(filepath.Join(dir, e.Name())); err != nil {
				return err
			}
		}
	}
	if err = os.Remove(filepath.Join(dir, "journal.json")); err != nil && !os.IsNotExist(err) {
		return err
	}
	// Persist journal removal before deleting the durable completion stamp; a
	// power loss must not resurrect a journal whose backups were already removed.
	if err = syncDirectory(dir); err != nil {
		return err
	}
	for _, n := range []string{"committed", "rolled-back"} {
		if err = os.Remove(filepath.Join(dir, n)); err != nil && !os.IsNotExist(err) {
			return err
		}
	}

	if err = os.Remove(dir); err != nil {
		return err
	}
	return syncDirectory(filepath.Dir(dir))
}
func restoreFile(dir, name, target string) error {
	tmp := filepath.Join(dir, "restore-"+name)
	if _, err := os.Lstat(tmp); err == nil {
		if regular(tmp) != nil {
			return errors.New("unsafe_install_transaction")
		}
		if err = os.Remove(tmp); err != nil {
			return err
		}
	}
	mode := os.FileMode(0600)
	if name == "binary" {
		mode = 0700
	}
	if err := copyNew(filepath.Join(dir, "before-"+name), tmp, mode); err != nil {
		return err
	}
	return os.Rename(tmp, target)
}

// recoverTransaction must hold both installation and state locks. Uncommitted
// publication always rolls back; a durable commit only cleans retained backups.
func recoverTransaction(prefix, state string) (recovered, initial bool, err error) {
	dir := filepath.Join(prefix, transactionName)
	if _, e := os.Lstat(dir); os.IsNotExist(e) {
		return false, false, nil
	}
	if _, e := transactionFiles(dir); e != nil {
		return false, false, errors.New("unsafe_install_transaction")
	}
	journal := filepath.Join(dir, "journal.json")
	if _, e := os.Lstat(journal); os.IsNotExist(e) {
		_, markerErr := os.Lstat(filepath.Join(prefix, markerName))
		_, binaryErr := os.Lstat(filepath.Join(prefix, BinaryName()))
		return true, os.IsNotExist(markerErr) && os.IsNotExist(binaryErr), cleanupTransaction(dir)
	}
	raw, e := os.ReadFile(journal)
	var tx transaction
	current, userErr := user.Current()
	if e != nil || userErr != nil || json.Unmarshal(raw, &tx) != nil || tx.Format != "mcp-studio-agent.transaction.v1" || tx.Owner != current.Uid || tx.State != state || tx.Action != "install" && tx.Action != "upgrade" && tx.Action != "uninstall" {
		return false, false, errors.New("unsafe_install_transaction")
	}
	for _, m := range []*marker{tx.Before, tx.After} {
		if m != nil && (m.Format != "mcp-studio-agent.install.v1" || m.Owner != tx.Owner || m.State != state) {
			return false, false, errors.New("unsafe_install_transaction")
		}
	}
	if tx.Action == "install" && (tx.Before != nil || tx.After == nil) || tx.Action == "upgrade" && (tx.Before == nil || tx.After == nil) || tx.Action == "uninstall" && (tx.Before == nil || tx.After != nil) {
		return false, false, errors.New("unsafe_install_transaction")
	}
	committed, e := os.ReadFile(filepath.Join(dir, "committed"))
	if e == nil {
		if string(committed) != "committed\n" || verifyPair(prefix, tx.After) != nil {
			return false, false, errors.New("transaction_commit_invalid")
		}
		return true, false, cleanupTransaction(dir)
	}
	if !os.IsNotExist(e) {
		return false, false, errors.New("install_recovery_required")
	}
	rolledBack, rollbackErr := os.ReadFile(filepath.Join(dir, "rolled-back"))
	if rollbackErr == nil {
		if string(rolledBack) != "rolled-back\n" || verifyPair(prefix, tx.Before) != nil {
			return false, false, errors.New("transaction_rollback_invalid")
		}
		return true, tx.Before == nil, cleanupTransaction(dir)
	}
	if !os.IsNotExist(rollbackErr) {
		return false, false, errors.New("install_recovery_required")
	}
	if tx.Before != nil {
		sum, e := hash(filepath.Join(dir, "before-binary"))
		markerSum, me := hash(filepath.Join(dir, "before-marker"))
		if e != nil || me != nil || sum != tx.Before.SHA256 || markerSum != tx.BeforeMarkerSHA {
			return false, false, errors.New("transaction_backup_invalid")
		}
		m, e := readMarker(filepath.Join(dir, "before-marker"), tx.Owner, state)
		if e != nil || m != *tx.Before {
			return false, false, errors.New("transaction_backup_invalid")
		}
		if e = restoreFile(dir, "binary", filepath.Join(prefix, BinaryName())); e != nil {
			return false, false, errors.New("install_recovery_required")
		}
		if e = restoreFile(dir, "marker", filepath.Join(prefix, markerName)); e != nil {
			return false, false, errors.New("install_recovery_required")
		}
	} else {
		for _, p := range []string{filepath.Join(prefix, BinaryName()), filepath.Join(prefix, markerName)} {
			if _, e := os.Lstat(p); e == nil {
				if regular(p) != nil || os.Remove(p) != nil {
					return false, false, errors.New("install_recovery_required")
				}
			} else if !os.IsNotExist(e) {
				return false, false, errors.New("install_recovery_required")
			}
		}
	}
	if e = syncDirectory(prefix); e != nil {
		return false, false, errors.New("install_recovery_required")
	}
	if e = verifyPair(prefix, tx.Before); e != nil {
		return false, false, e
	}
	stamp := filepath.Join(dir, "rollback-pending")
	if _, e := os.Lstat(stamp); e == nil {
		if regular(stamp) != nil || os.Remove(stamp) != nil {
			return false, false, errors.New("install_recovery_required")
		}
	}
	if e = writeNew(stamp, []byte("rolled-back\n"), 0600); e != nil {
		return false, false, errors.New("install_recovery_required")
	}
	if e = os.Rename(stamp, filepath.Join(dir, "rolled-back")); e != nil {
		return false, false, errors.New("install_recovery_required")
	}
	if e = syncDirectory(dir); e != nil {
		return false, false, errors.New("install_recovery_required")
	}
	return true, tx.Before == nil, cleanupTransaction(dir)
}
func publishTransaction(action, prefix, state, source string, before, after *marker, ops operations) error {
	dir := filepath.Join(prefix, transactionName)
	if err := os.Mkdir(dir, 0700); err != nil {
		return errors.New("transaction_staging_failed")
	}
	tx := transaction{Format: "mcp-studio-agent.transaction.v1", Action: action, Owner: afterOwner(before, after), State: state, Before: before, After: after}
	// Once any publication begins, failures recover using independent OS operations.
	fail := func(code string) error {
		if _, _, err := recoverTransaction(prefix, state); err != nil {
			return errors.New("install_recovery_required")
		}
		return errors.New(code)
	}
	if before != nil {
		if err := copyNew(filepath.Join(prefix, BinaryName()), filepath.Join(dir, "before-binary"), 0700); err != nil {
			return fail("transaction_backup_failed")
		}
		if err := copyNew(filepath.Join(prefix, markerName), filepath.Join(dir, "before-marker"), 0600); err != nil {
			return fail("transaction_backup_failed")
		}
		tx.BeforeMarkerSHA, _ = hash(filepath.Join(dir, "before-marker"))
	}
	if after != nil {
		if err := copyNew(source, filepath.Join(dir, "after-binary"), 0700); err != nil {
			return fail("candidate_copy_failed")
		}
		sum, err := hash(filepath.Join(dir, "after-binary"))
		if err != nil || sum != after.SHA256 {
			return fail("candidate_changed")
		}
		raw, _ := json.Marshal(after)
		if err = writeNew(filepath.Join(dir, "after-marker"), append(raw, '\n'), 0600); err != nil {
			return fail("marker_write_failed")
		}
	}
	raw, _ := json.Marshal(tx)
	if err := writeNew(filepath.Join(dir, "journal-pending"), append(raw, '\n'), 0600); err != nil {
		return fail("transaction_journal_failed")
	}
	if err := os.Rename(filepath.Join(dir, "journal-pending"), filepath.Join(dir, "journal.json")); err != nil {
		return fail("transaction_journal_failed")
	}
	if err := syncDirectory(dir); err != nil {
		return fail("transaction_journal_failed")
	}
	if err := syncDirectory(prefix); err != nil {
		return fail("transaction_journal_failed")
	}
	if after != nil {
		if err := ops.rename(filepath.Join(dir, "after-binary"), filepath.Join(prefix, BinaryName())); err != nil {
			return fail("binary_replacement_failed")
		}
		if err := ops.rename(filepath.Join(dir, "after-marker"), filepath.Join(prefix, markerName)); err != nil {
			return fail("marker_write_failed")
		}
	} else {
		if err := ops.remove(filepath.Join(prefix, BinaryName())); err != nil {
			return fail("binary_removal_failed")
		}
		if err := ops.remove(filepath.Join(prefix, markerName)); err != nil {
			return fail("marker_removal_failed")
		}
	}
	if err := syncDirectory(prefix); err != nil {
		return fail("transaction_publication_failed")
	}
	if err := writeNew(filepath.Join(dir, "commit-pending"), []byte("committed\n"), 0600); err != nil {
		return fail("transaction_commit_failed")
	}
	if err := ops.rename(filepath.Join(dir, "commit-pending"), filepath.Join(dir, "committed")); err != nil {
		return fail("transaction_commit_failed")
	}
	if err := syncDirectory(dir); err != nil {
		return errors.New("install_recovery_required")
	}
	if err := cleanupTransaction(dir); err != nil {
		return errors.New("install_cleanup_pending")
	}
	return nil
}
func afterOwner(before, after *marker) string {
	if after != nil {
		return after.Owner
	}
	return before.Owner
}
