package process

import (
	"path/filepath"
	"testing"
)

func TestAgentDirectoryAllowsOneProcess(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agent.lock")
	first, err := Lock(path)
	if err != nil {
		t.Fatal(err)
	}
	if second, err := Lock(path); err == nil {
		second.Close()
		t.Fatal("concurrent Agent allowed")
	}
	first.Close()
	third, err := Lock(path)
	if err != nil {
		t.Fatal(err)
	}
	third.Close()
}
