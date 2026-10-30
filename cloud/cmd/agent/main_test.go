package main

import (
	"testing"
)

func TestAgentFlagsRequireExactPlatformOriginAndLoopback(t *testing.T) {
	for _, args := range [][]string{{"--origin", "http://work.example"}, {"--origin", "https://work.example", "--listen", "0.0.0.0:45455"}, {"--origin", "https://work.example/path"}} {
		if _, err := parseOptions(args); err == nil {
			t.Fatalf("accepted %v", args)
		}
	}
	opts, err := parseOptions([]string{"--origin", "https://work.example", "--listen", "127.0.0.1:45455"})
	if err != nil || opts.Listen != "127.0.0.1:45455" {
		t.Fatal(err)
	}
	if _, err := parseOptions([]string{"--origin", "http://127.0.0.1:8080", "--allow-insecure-loopback"}); err != nil {
		t.Fatal(err)
	}
}
