package platform

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

// clearSettingsEnv makes configuration tests independent of the developer
// shell. Empty values are ignored by the environment layer.
func clearSettingsEnv(t *testing.T) {
	t.Helper()
	for key := range editableVariables {
		t.Setenv(key, "")
	}
	t.Setenv(configFileVariable, "")
}

func TestSettingsDefaultsAreLegal(t *testing.T) {
	clearSettingsEnv(t)
	settings, err := loadSettings(nil)
	if err != nil {
		t.Fatal(err)
	}
	if settings.Listen != "127.0.0.1:8080" || settings.SessionIdle != 8*time.Hour || settings.SessionAbsolute != 24*time.Hour {
		t.Fatalf("unexpected defaults: %+v", settings)
	}
	if settings.RecordCapacityBytes != 5<<30 || settings.HistoryRetentionDays != 90 || settings.MaxHistoryRetentionDays != 90 || settings.RecordSweepInterval != time.Hour {
		t.Fatalf("unexpected record defaults: %+v", settings)
	}
}

func TestSettingsPrecedence(t *testing.T) {
	clearSettingsEnv(t)
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"MCP_STUDIO_LISTEN":"127.0.0.1:9100","MCP_STUDIO_SESSION_IDLE":"1h"}`), 0600); err != nil {
		t.Fatal(err)
	}
	defaults := []byte(`{"MCP_STUDIO_LISTEN":"127.0.0.1:9000","MCP_STUDIO_SESSION_IDLE":"2h","MCP_STUDIO_RECORD_SWEEP_INTERVAL":"30m"}`)
	t.Setenv(configFileVariable, path)
	t.Setenv("MCP_STUDIO_SESSION_IDLE", "3h")
	settings, err := loadSettings(defaults)
	if err != nil {
		t.Fatal(err)
	}
	if settings.Listen != "127.0.0.1:9100" {
		t.Fatalf("operator file did not override edition defaults: %q", settings.Listen)
	}
	if settings.SessionIdle != 3*time.Hour {
		t.Fatalf("environment did not override the file: %s", settings.SessionIdle)
	}
	if settings.RecordSweepInterval != 30*time.Minute {
		t.Fatalf("edition defaults did not survive layering: %s", settings.RecordSweepInterval)
	}
	if settings.RecordCapacityBytes != 5<<30 {
		t.Fatalf("built-in defaults did not survive layering: %d", settings.RecordCapacityBytes)
	}
}

func TestSettingsRejectUnknownAndSecretKeys(t *testing.T) {
	clearSettingsEnv(t)
	for name, body := range map[string]string{
		"unknown":          `{"MCP_STUDIO_UNKNOWN":"x"}`,
		"database":         `{"MCP_STUDIO_DATABASE_URL":"postgres://fixture"}`,
		"init credential":  `{"MCP_STUDIO_INIT_CREDENTIAL":"fixture"}`,
		"backup key":       `{"MCP_STUDIO_BACKUP_KEY":"fixture"}`,
		"smtp password":    `{"MCP_STUDIO_SMTP_PASSWORD":"fixture"}`,
		"not json":         `not json`,
		"non string value": `{"MCP_STUDIO_RECORD_CAPACITY_BYTES":5368709120}`,
	} {
		if _, err := loadSettings([]byte(body)); err == nil {
			t.Fatalf("configuration layer accepted %s", name)
		}
	}
}

// The 17 environment variables must all be accounted for: 13 non-secret
// settings plus 4 secrets read through the secret source.
func TestConfigurationVariableCoverage(t *testing.T) {
	want := []string{
		"MCP_STUDIO_DATABASE_URL",
		"MCP_STUDIO_ORIGIN",
		"MCP_STUDIO_LISTEN",
		"MCP_STUDIO_STATIC_DIR",
		"MCP_STUDIO_INIT_CREDENTIAL",
		"MCP_STUDIO_SMTP_ADDRESS",
		"MCP_STUDIO_SMTP_FROM",
		"MCP_STUDIO_SMTP_USERNAME",
		"MCP_STUDIO_SMTP_PASSWORD",
		"MCP_STUDIO_BACKUP_KEY",
		"MCP_STUDIO_ALLOW_INSECURE_LOOPBACK",
		"MCP_STUDIO_RECORD_CAPACITY_BYTES",
		"MCP_STUDIO_HISTORY_RETENTION_DAYS",
		"MCP_STUDIO_MAX_HISTORY_RETENTION_DAYS",
		"MCP_STUDIO_RECORD_SWEEP_INTERVAL",
		"MCP_STUDIO_SESSION_IDLE",
		"MCP_STUDIO_SESSION_ABSOLUTE",
	}
	if len(want) != 17 || len(editableVariables)+len(secretVariables) != len(want) {
		t.Fatalf("configuration coverage drifted: %d editable, %d secret", len(editableVariables), len(secretVariables))
	}
	covered := map[string]bool{}
	for key := range editableVariables {
		covered[key] = true
	}
	for key := range secretVariables {
		covered[key] = true
	}
	for _, key := range want {
		if !covered[key] {
			t.Fatalf("configuration variable not accounted for: %s", key)
		}
	}
	if len(covered) != len(want) {
		t.Fatalf("unexpected configuration variables: %d covered", len(covered))
	}
}
