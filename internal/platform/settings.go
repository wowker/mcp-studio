package platform

import (
	"encoding/json"
	"errors"
	"os"
	"strconv"
	"time"
)

// Options carries edition assets supplied by the release shell.
type Options struct {
	// Defaults is the edition default configuration file (JSON). It is the
	// lowest-priority file layer above the built-in defaults.
	Defaults []byte
}

// Settings is the non-secret deployment configuration. Secrets never pass
// through this layer; they are read from the secret source in Run.
type Settings struct {
	Origin                  string
	Listen                  string
	StaticDir               string
	SMTPAddress             string
	SMTPFrom                string
	SMTPUsername            string
	SessionIdle             time.Duration
	SessionAbsolute         time.Duration
	RecordCapacityBytes     int64
	HistoryRetentionDays    int
	MaxHistoryRetentionDays int
	RecordSweepInterval     time.Duration
	AllowInsecureLoopback   bool
}

// configFileVariable points at an optional operator configuration file layered
// between edition defaults and environment variables.
const configFileVariable = "MCP_STUDIO_CONFIG_FILE"

// secretVariables are accepted only through the secret source (environment or
// a mounted `_FILE`), never through a configuration file.
var secretVariables = map[string]bool{
	"MCP_STUDIO_DATABASE_URL":    true,
	"MCP_STUDIO_INIT_CREDENTIAL": true,
	"MCP_STUDIO_BACKUP_KEY":      true,
	"MCP_STUDIO_SMTP_PASSWORD":   true,
}

// editableVariables are the non-secret variables a configuration file may set.
var editableVariables = map[string]bool{
	"MCP_STUDIO_ORIGIN":                     true,
	"MCP_STUDIO_LISTEN":                     true,
	"MCP_STUDIO_STATIC_DIR":                 true,
	"MCP_STUDIO_SMTP_ADDRESS":               true,
	"MCP_STUDIO_SMTP_FROM":                  true,
	"MCP_STUDIO_SMTP_USERNAME":              true,
	"MCP_STUDIO_SESSION_IDLE":               true,
	"MCP_STUDIO_SESSION_ABSOLUTE":           true,
	"MCP_STUDIO_RECORD_CAPACITY_BYTES":      true,
	"MCP_STUDIO_HISTORY_RETENTION_DAYS":     true,
	"MCP_STUDIO_MAX_HISTORY_RETENTION_DAYS": true,
	"MCP_STUDIO_RECORD_SWEEP_INTERVAL":      true,
	"MCP_STUDIO_ALLOW_INSECURE_LOOPBACK":    true,
}

// builtinDefaults keep the configuration legal without any file or variable.
var builtinDefaults = map[string]string{
	"MCP_STUDIO_LISTEN":                     "127.0.0.1:8080",
	"MCP_STUDIO_SESSION_IDLE":               "8h",
	"MCP_STUDIO_SESSION_ABSOLUTE":           "24h",
	"MCP_STUDIO_RECORD_CAPACITY_BYTES":      "5368709120",
	"MCP_STUDIO_HISTORY_RETENTION_DAYS":     "90",
	"MCP_STUDIO_MAX_HISTORY_RETENTION_DAYS": "90",
	"MCP_STUDIO_RECORD_SWEEP_INTERVAL":      "1h",
	"MCP_STUDIO_ALLOW_INSECURE_LOOPBACK":    "false",
}

// loadSettings merges layers in ascending priority: built-in defaults, the
// edition default file, the optional operator file and environment variables.
func loadSettings(editionDefaults []byte) (Settings, error) {
	values := make(map[string]string, len(builtinDefaults))
	for key, value := range builtinDefaults {
		values[key] = value
	}
	if len(editionDefaults) > 0 {
		if err := applyLayer(values, editionDefaults); err != nil {
			return Settings{}, err
		}
	}
	if path := os.Getenv(configFileVariable); path != "" {
		raw, err := readConfigFile(path)
		if err != nil {
			return Settings{}, err
		}
		if err = applyLayer(values, raw); err != nil {
			return Settings{}, err
		}
	}
	for key := range editableVariables {
		if raw, ok := os.LookupEnv(key); ok && raw != "" {
			values[key] = raw
		}
	}
	return parseSettings(values)
}

// applyLayer rejects unknown keys and secret keys so a shared file can never
// carry credentials or silently accept typos.
func applyLayer(values map[string]string, raw []byte) error {
	var layer map[string]string
	if err := json.Unmarshal(raw, &layer); err != nil {
		return errors.New("invalid configuration file")
	}
	for key, value := range layer {
		if !editableVariables[key] {
			return errors.New("unsupported configuration key: " + key)
		}
		values[key] = value
	}
	return nil
}

func readConfigFile(path string) ([]byte, error) {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 65536 {
		return nil, errors.New("configuration file unavailable")
	}
	raw, err := os.ReadFile(path)
	if err != nil || len(raw) > 65536 {
		return nil, errors.New("configuration file unavailable")
	}
	return raw, nil
}

func parseSettings(values map[string]string) (Settings, error) {
	var s Settings
	s.Origin = values["MCP_STUDIO_ORIGIN"]
	s.Listen = values["MCP_STUDIO_LISTEN"]
	s.StaticDir = values["MCP_STUDIO_STATIC_DIR"]
	s.SMTPAddress = values["MCP_STUDIO_SMTP_ADDRESS"]
	s.SMTPFrom = values["MCP_STUDIO_SMTP_FROM"]
	s.SMTPUsername = values["MCP_STUDIO_SMTP_USERNAME"]
	var err error
	if s.SessionIdle, err = parseDuration(values["MCP_STUDIO_SESSION_IDLE"], 8*time.Hour); err != nil {
		return Settings{}, err
	}
	if s.SessionAbsolute, err = parseDuration(values["MCP_STUDIO_SESSION_ABSOLUTE"], 24*time.Hour); err != nil {
		return Settings{}, err
	}
	if s.RecordCapacityBytes, err = parsePositiveInteger(values["MCP_STUDIO_RECORD_CAPACITY_BYTES"], 5<<30); err != nil {
		return Settings{}, err
	}
	days, err := parsePositiveInteger(values["MCP_STUDIO_HISTORY_RETENTION_DAYS"], 90)
	if err != nil {
		return Settings{}, err
	}
	maxDays, err := parsePositiveInteger(values["MCP_STUDIO_MAX_HISTORY_RETENTION_DAYS"], 90)
	if err != nil || days > maxDays || maxDays > 365000 {
		return Settings{}, errors.New("invalid record retention configuration")
	}
	s.HistoryRetentionDays = int(days)
	s.MaxHistoryRetentionDays = int(maxDays)
	if s.RecordSweepInterval, err = parseDuration(values["MCP_STUDIO_RECORD_SWEEP_INTERVAL"], time.Hour); err != nil {
		return Settings{}, errors.New("invalid record sweep interval")
	}
	if s.AllowInsecureLoopback, err = strconv.ParseBool(values["MCP_STUDIO_ALLOW_INSECURE_LOOPBACK"]); err != nil {
		return Settings{}, errors.New("invalid insecure loopback configuration")
	}
	return s, nil
}

func parseDuration(raw string, fallback time.Duration) (time.Duration, error) {
	if raw == "" {
		return fallback, nil
	}
	d, err := time.ParseDuration(raw)
	if err != nil || d <= 0 {
		return 0, errors.New("invalid session duration configuration")
	}
	return d, nil
}

func parsePositiveInteger(raw string, fallback int64) (int64, error) {
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || n <= 0 {
		return 0, errors.New("invalid record storage configuration")
	}
	return n, nil
}
