package infrastructure

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSecretEnvironmentFileAndConflict(t *testing.T) {
	const name = "MCP_STUDIO_TEST_SECRET"
	t.Setenv(name, "")
	t.Setenv(name+"_FILE", "")
	if got, err := Secret(name); err != nil || got != "" {
		t.Fatal("empty secret", err)
	}
	t.Setenv(name, "legacy-opaque")
	if got, err := Secret(name); err != nil || got != "legacy-opaque" {
		t.Fatal("environment compatibility", err)
	}
	p := filepath.Join(t.TempDir(), "private")
	os.WriteFile(p, []byte("file-opaque\n"), 0600)
	t.Setenv(name+"_FILE", p)
	if _, err := Secret(name); err == nil || strings.Contains(err.Error(), "opaque") {
		t.Fatal("conflicting secret sources accepted or logged")
	}
	t.Setenv(name, "")
	if got, err := Secret(name); err != nil || got != "file-opaque" {
		t.Fatal("file secret", err)
	}
	os.WriteFile(p, []byte("bad\x00secret"), 0600)
	if _, err := Secret(name); err == nil {
		t.Fatal("nul accepted")
	}
	os.Remove(p)
	if _, err := Secret(name); err == nil || strings.Contains(err.Error(), p) {
		t.Fatal("missing secret file or path leaked")
	}
	os.Symlink(filepath.Join(t.TempDir(), "absent"), p)
	if _, err := Secret(name); err == nil {
		t.Fatal("symlink accepted")
	}
}
