package main

import (
	"encoding/base64"
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

func TestRecordStorageConfigurationRejectedBeforeDatabase(t *testing.T) {
	for _, tc := range []struct{ key, value string }{
		{"MCP_STUDIO_RECORD_CAPACITY_BYTES", "0"}, {"MCP_STUDIO_RECORD_CAPACITY_BYTES", "-1"}, {"MCP_STUDIO_RECORD_CAPACITY_BYTES", "not-a-number"}, {"MCP_STUDIO_HISTORY_RETENTION_DAYS", "0"}, {"MCP_STUDIO_HISTORY_RETENTION_DAYS", "91"}, {"MCP_STUDIO_MAX_HISTORY_RETENTION_DAYS", "0"}, {"MCP_STUDIO_RECORD_SWEEP_INTERVAL", "0s"},
	} {
		t.Run(tc.key+tc.value, func(t *testing.T) {
			t.Setenv("MCP_STUDIO_ORIGIN", "https://studio.example.test")
			t.Setenv("MCP_STUDIO_LISTEN", "127.0.0.1:8080")
			t.Setenv("MCP_STUDIO_DATABASE_URL", "")
			t.Setenv(tc.key, tc.value)
			err := run()
			if err == nil || strings.Contains(err.Error(), "database") {
				t.Fatalf("invalid record configuration reached database: %v", err)
			}
		})
	}
}

func TestBackupKeyExplicitConfiguration(t *testing.T) {
	t.Setenv("MCP_STUDIO_BACKUP_KEY", "")
	key, err := backupKey()
	if err != nil || key != nil {
		t.Fatal("backup not off by default")
	}
	for _, raw := range []string{"bad-base64", base64.StdEncoding.EncodeToString(make([]byte, 16))} {
		t.Setenv("MCP_STUDIO_BACKUP_KEY", raw)
		if _, err := backupKey(); err == nil {
			t.Fatal("invalid backup key accepted")
		}
	}
	t.Setenv("MCP_STUDIO_BACKUP_KEY", base64.StdEncoding.EncodeToString(make([]byte, 32)))
	key, err = backupKey()
	if err != nil || len(key) != 32 {
		t.Fatal("valid backup key rejected")
	}
}
