package platform

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestPgThreadShimPathEnvOverride(t *testing.T) {
	t.Setenv("MCP_STUDIO_PG_THREAD_SHIM", "/tmp/explicit-shim.dylib")
	if got := pgThreadShimPath(); got != "/tmp/explicit-shim.dylib" {
		t.Fatalf("pgThreadShimPath() = %q, want explicit env override", got)
	}
}

func TestPgEnvInjectsShimOnDarwinOnly(t *testing.T) {
	t.Setenv("MCP_STUDIO_PG_THREAD_SHIM", "/tmp/explicit-shim.dylib")
	var injected []string
	for _, entry := range pgEnv() {
		if strings.HasPrefix(entry, "DYLD_INSERT_LIBRARIES=") {
			injected = append(injected, entry)
		}
	}
	if runtime.GOOS == "darwin" {
		if len(injected) != 1 || injected[0] != "DYLD_INSERT_LIBRARIES=/tmp/explicit-shim.dylib" {
			t.Fatalf("darwin pgEnv injection = %v, want exactly DYLD_INSERT_LIBRARIES=/tmp/explicit-shim.dylib", injected)
		}
	} else if len(injected) != 0 {
		t.Fatalf("non-darwin pgEnv must not inject shim, got %v", injected)
	}
}

func TestPgEnvWithoutShimOmitsInjection(t *testing.T) {
	t.Setenv("MCP_STUDIO_PG_THREAD_SHIM", "")
	// Isolate from the development-layout fallback (.runtime/...): no dylib in
	// a fresh temp cwd, and the test binary's own directory carries no shim.
	t.Chdir(t.TempDir())
	for _, entry := range pgEnv() {
		if strings.HasPrefix(entry, "DYLD_INSERT_LIBRARIES=") {
			t.Fatalf("pgEnv injected DYLD_INSERT_LIBRARIES without an available shim: %q", entry)
		}
	}
}

func TestBundledPGDir(t *testing.T) {
	root := t.TempDir()
	exe := filepath.Join(root, "mcp-studio")

	if got := bundledPGDir(exe); got != "" {
		t.Fatalf("bundledPGDir without pg/ = %q, want empty", got)
	}

	// A regular file must not shadow the PATH fallback.
	pgBin := filepath.Join(root, "pg", "bin")
	if err := os.MkdirAll(filepath.Dir(pgBin), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(pgBin, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := bundledPGDir(exe); got != "" {
		t.Fatalf("bundledPGDir with pg/bin as regular file = %q, want empty", got)
	}

	// A real pg/bin directory next to the executable is the bundle (pg/lib and
	// pg/share sit alongside and the tools resolve them via @loader_path).
	if err := os.Remove(pgBin); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(pgBin, 0o700); err != nil {
		t.Fatal(err)
	}
	if got := bundledPGDir(exe); got != pgBin {
		t.Fatalf("bundledPGDir with pg/bin = %q, want %q", got, pgBin)
	}
}

func TestLocalPGBinDirEnvPrecedence(t *testing.T) {
	// Explicit overrides win over any bundle (the test binary's own directory
	// carries no pg/, so only the env rules are exercised here).
	t.Setenv("MCP_STUDIO_LOCAL_PG_BIN", "/opt/custom-pg/bin")
	t.Setenv("MCP_STUDIO_LOCAL_PG_DIR", "/opt/custom-pg-dir")
	if got := localPGBinDir(); got != "/opt/custom-pg/bin" {
		t.Fatalf("localPGBinDir = %q, want MCP_STUDIO_LOCAL_PG_BIN to win", got)
	}
	t.Setenv("MCP_STUDIO_LOCAL_PG_BIN", "")
	if got := localPGBinDir(); !strings.HasPrefix(got, "/opt/custom-pg-dir") {
		t.Fatalf("localPGBinDir = %q, want MCP_STUDIO_LOCAL_PG_DIR-derived path", got)
	}
}
