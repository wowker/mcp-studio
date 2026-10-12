package main

import (
	"strings"
	"testing"
	"time"
)

func TestRejectInvalidOriginAndRemoteInsecureListener(t *testing.T) {
	for _, tc := range []struct{ name, origin, listen string }{
		{"missing", "", "127.0.0.1:8080"},
		{"query", "https://studio.example.test?credential=fixture", "127.0.0.1:8080"},
		{"fragment", "https://studio.example.test#fixture", "127.0.0.1:8080"},
		{"userinfo", "https://fixture@studio.example.test", "127.0.0.1:8080"},
		{"remoteHTTP", "http://studio.example.test", "127.0.0.1:8080"},
		{"remoteBind", "http://127.0.0.1:8080", "0.0.0.0:8080"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("MCP_STUDIO_ORIGIN", tc.origin)
			t.Setenv("MCP_STUDIO_LISTEN", tc.listen)
			t.Setenv("MCP_STUDIO_ALLOW_INSECURE_LOOPBACK", "true")
			t.Setenv("MCP_STUDIO_DATABASE_URL", "")
			err := run()
			if err == nil || strings.Contains(err.Error(), "database") {
				t.Fatalf("configuration passed security gate: %v", err)
			}
		})
	}
}

func TestSessionDurationValidation(t *testing.T) {
	for _, raw := range []string{"0s", "-1h", "garbage"} {
		t.Setenv("MCP_STUDIO_SESSION_IDLE", raw)
		if _, err := duration("MCP_STUDIO_SESSION_IDLE", 8*time.Hour); err == nil {
			t.Fatal("invalid duration accepted")
		}
	}
	t.Setenv("MCP_STUDIO_SESSION_IDLE", "")
	if got, err := duration("MCP_STUDIO_SESSION_IDLE", 8*time.Hour); err != nil || got != 8*time.Hour {
		t.Fatal("default duration changed")
	}
}
