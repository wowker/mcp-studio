package platform

import (
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
