package main

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"testing"
)

func TestBackupKeyMountedSecret(t *testing.T) {
	p := filepath.Join(t.TempDir(), "key")
	os.WriteFile(p, []byte(base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{3}, 32))+"\n"), 0600)
	t.Setenv("MCP_STUDIO_BACKUP_KEY", "")
	t.Setenv("MCP_STUDIO_BACKUP_KEY_FILE", p)
	got, err := backupKey()
	if err != nil || !bytes.Equal(got, bytes.Repeat([]byte{3}, 32)) {
		t.Fatal("mounted key not loaded", err)
	}
	t.Setenv("MCP_STUDIO_BACKUP_KEY", "conflict")
	if _, err = backupKey(); err == nil {
		t.Fatal("ambiguous key")
	}
}
