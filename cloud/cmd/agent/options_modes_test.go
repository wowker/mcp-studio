package main

import (
	"path/filepath"
	"testing"
)

// B16: parseOptions gates which Agent modes can be combined and requires an
// absolute state directory for install/upgrade/uninstall. main_test.go and
// diagnostics_test.go already cover origin/loopback and secret echoing; these
// assertions close the mode-exclusion and directory-shape branches.

func TestAgentModesAreMutuallyExclusive(t *testing.T) {
	cases := [][]string{
		{"--version", "--diagnose"},
		{"--version", "--install-prefix", "/tmp/new", "--state-dir", "/tmp/state"},
		{"--diagnose", "--upgrade-prefix", "/tmp/managed", "--state-dir", "/tmp/state"},
		{"--install-prefix", "/tmp/new", "--uninstall-prefix", "/tmp/managed", "--state-dir", "/tmp/state"},
	}
	for _, args := range cases {
		if _, err := parseOptions(args); err == nil {
			t.Errorf("accepted mutually exclusive modes: %v", args)
		}
	}
}

func TestInstallModesRequireAbsoluteStateDirectory(t *testing.T) {
	for _, args := range [][]string{
		{"--install-prefix", "/tmp/new"},
		{"--install-prefix", "/tmp/new", "--state-dir", "relative/path"},
		{"--upgrade-prefix", "/tmp/managed"},
		{"--uninstall-prefix", "/tmp/managed"},
	} {
		if _, err := parseOptions(args); err == nil {
			t.Errorf("accepted non-absolute state directory: %v", args)
		}
	}
	if _, err := parseOptions([]string{"--install-prefix", "/tmp/new", "--state-dir", "/tmp/state"}); err != nil {
		t.Errorf("rejected valid install mode: %v", err)
	}
}

func TestListenMustBeLiteralLoopbackWithRealPort(t *testing.T) {
	for _, listen := range []string{"127.0.0.1:0", "localhost:45455", "127.0.0.1", "0.0.0.0:45455", ":45455"} {
		if _, err := parseOptions([]string{"--origin", "https://work.example", "--listen", listen}); err == nil {
			t.Errorf("accepted non-literal loopback listen %q", listen)
		}
	}
}

func TestOriginRequiresHTTPSUnlessExplicitLoopback(t *testing.T) {
	base := []string{"--listen", "127.0.0.1:45455"}
	if _, err := parseOptions(base); err == nil {
		t.Error("missing origin must be rejected")
	}
	if _, err := parseOptions(append(base, "--origin", "http://localhost:8080")); err == nil {
		t.Error("http origin without --allow-insecure-loopback must be rejected")
	}
	if _, err := parseOptions(append(base, "--origin", "http://localhost:8080", "--allow-insecure-loopback")); err != nil {
		t.Errorf("explicit loopback HTTP origin rejected: %v", err)
	}
	if _, err := parseOptions(append(base, "--origin", "http://work.example", "--allow-insecure-loopback")); err == nil {
		t.Error("--allow-insecure-loopback must not permit a non-loopback HTTP host")
	}
}

func TestDefaultStateDirectoryIsAbsolute(t *testing.T) {
	opts, err := parseOptions([]string{"--origin", "https://work.example", "--listen", "127.0.0.1:45455"})
	if err != nil {
		t.Fatalf("valid defaults rejected: %v", err)
	}
	if opts.Directory == "" || !filepath.IsAbs(opts.Directory) {
		t.Errorf("default state directory must be absolute, got %q", opts.Directory)
	}
}

func TestMemoryOnlyIsRecorded(t *testing.T) {
	opts, err := parseOptions([]string{"--origin", "https://work.example", "--listen", "127.0.0.1:45455", "--memory-only"})
	if err != nil {
		t.Fatalf("--memory-only rejected: %v", err)
	}
	if !opts.Memory {
		t.Error("--memory-only not recorded in options")
	}
}
