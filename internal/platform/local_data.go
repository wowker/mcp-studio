package platform

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const (
	// localRoleName is the application role the local edition creates inside
	// its embedded PostgreSQL cluster and uses for all business connections.
	localRoleName = "mcp_studio_local"
	// localDBName is the database inside that cluster.
	localDBName = "mcp_studio_local"
	// localSuperUser is the bootstrap superuser created by initdb that owns
	// the data directory. We use a role distinct from the OS user and from
	// `postgres` so multiple local editions on one machine do not clobber
	// each other.
	localSuperUser = "mcp_studio_local_super"
	// localSubjectEmail is the single local user seeded into the database on
	// first launch. The email is a sentinel — the local edition never sends
	// mail nor does any verification round-trip.
	localSubjectEmail = "local@mcp-studio.local"
	localSubjectName  = "Local"
	localTeamName     = "Local"
	localProjectName  = "Personal"
	// localDefaultPort avoids the cloud default 5432 and a typical Docker
	// fallback 15432 so two editions can coexist on one machine.
	localDefaultPort = "16432"
)

// localDataDir resolves the per-user directory that hosts the embedded
// PostgreSQL cluster and any local state. Defaults to the platform-standard
// location below; override with MCP_STUDIO_LOCAL_DATA_DIR.
func localDataDir() (string, error) {
	if custom := os.Getenv("MCP_STUDIO_LOCAL_DATA_DIR"); custom != "" {
		return custom, nil
	}
	switch runtime.GOOS {
	case "darwin":
		base, err := os.UserConfigDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(base, "MCP Studio"), nil
	case "windows":
		base := os.Getenv("LOCALAPPDATA")
		if base == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", err
			}
			base = filepath.Join(home, "AppData", "Local")
		}
		return filepath.Join(base, "MCPStudio"), nil
	default:
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		// XDG_DATA_HOME is the Linux standard; fall back to ~/.local/share.
		if xdg := os.Getenv("XDG_DATA_HOME"); xdg != "" {
			return filepath.Join(xdg, "mcp-studio"), nil
		}
		return filepath.Join(home, ".local", "share", "mcp-studio"), nil
	}
}

// localPGBinDir locates the bundled PostgreSQL tools. Precedence: explicit
// MCP_STUDIO_LOCAL_PG_BIN override, then MCP_STUDIO_LOCAL_PG_DIR/<ver>/bin
// (matches Homebrew's unversioned prefix), then PATH lookup which the caller
// performs separately. Returns "" when no explicit override is set.
func localPGBinDir() string {
	if custom := os.Getenv("MCP_STUDIO_LOCAL_PG_BIN"); custom != "" {
		return custom
	}
	if prefix := os.Getenv("MCP_STUDIO_LOCAL_PG_DIR"); prefix != "" {
		return filepath.Join(prefix, "bin")
	}
	return ""
}

// localPGPort returns the TCP port the embedded PostgreSQL cluster listens on.
func localPGPort() string {
	if custom := os.Getenv("MCP_STUDIO_LOCAL_PG_PORT"); custom != "" {
		return custom
	}
	return localDefaultPort
}

// resolveExecutable searches binDir (if given) and then PATH for `name`.
// Returns the absolute path, or an error that lists both directories.
func resolveExecutable(name, binDir string) (string, error) {
	candidates := []string{}
	if binDir != "" {
		candidates = append(candidates, filepath.Join(binDir, name))
	}
	if path, err := exec.LookPath(name); err == nil {
		candidates = append(candidates, path)
	}
	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && !info.IsDir() {
			return c, nil
		}
	}
	return "", errors.New("postgresql binary not found: " + name + " (checked " + strings.Join(candidates, ", ") + ")")
}
