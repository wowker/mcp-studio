package main

import (
	"bytes"
	"encoding/base64"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOfflineConfirmationAndKeyFilesFailClosed(t *testing.T) {
	for _, args := range [][]string{{}, {"rotate-backup-key"}, {"rotate-backup-key", "--offline-confirmed", "--old-key-file", "absent"}, {"rotate-backup-key", "--offline-confirmed", "--unknown", "opaque"}} {
		if e := run(args, io.Discard); e == nil || strings.Contains(e.Error(), "opaque") {
			t.Fatal("unsafe admin args")
		}
	}
	p := filepath.Join(t.TempDir(), "key")
	os.WriteFile(p, []byte(base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{4}, 32))+"\n"), 0600)
	if b, e := key(p); e != nil || len(b) != 32 {
		t.Fatal("valid file rejected", e)
	}
	os.Remove(p)
	os.Symlink("absent", p)
	if _, e := key(p); e == nil {
		t.Fatal("symlink accepted")
	}
}
