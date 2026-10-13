package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiagnosticsNeverInitializeStateOrEchoConfiguration(t *testing.T) {
	for _, mode := range []string{"--version", "--diagnose"} {
		state := filepath.Join(t.TempDir(), "absent")
		o, err := parseOptions([]string{mode, "--state-dir", state, "--origin", "https://private:secret@work.example/?token=hidden"})
		if err != nil {
			t.Fatal(err)
		}
		var output bytes.Buffer
		if err := execute(o, &output); err != nil {
			t.Fatal(err)
		}
		if _, err := os.Stat(state); !os.IsNotExist(err) {
			t.Fatal("diagnostic initialized state")
		}
		for _, secret := range []string{"private", "secret", "hidden", state} {
			if strings.Contains(output.String(), secret) {
				t.Fatal("diagnostic leaked configuration")
			}
		}
		if !strings.Contains(output.String(), "version") {
			t.Fatal("missing version")
		}
	}
}
func TestInvalidFlagsNeverEchoArguments(t *testing.T) {
	_, err := parseOptions([]string{"--unknown=secret-value"})
	if err == nil || strings.Contains(err.Error(), "secret-value") {
		t.Fatal("flag error leaks argument")
	}
}
