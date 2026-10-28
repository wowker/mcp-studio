//go:build !local

package platform

import (
	"strings"
	"testing"
)

// Cloud startup path: the edition still enforces HTTPS and still consumes the
// initialization credential. The legacy loopback switch remains only an
// explicit operator override, never the default.
func TestCloudEditionStartupPath(t *testing.T) {
	if CurrentEdition != EditionCloud {
		t.Fatalf("default build must select the cloud edition, got %s", CurrentEdition)
	}
	if !PolicyFor(CurrentEdition).ReadBootstrapCredential {
		t.Fatal("cloud edition must consume the initialization credential")
	}
	clearSettingsEnv(t)
	t.Setenv("MCP_STUDIO_ORIGIN", "http://127.0.0.1:8080")
	t.Setenv("MCP_STUDIO_LISTEN", "127.0.0.1:8080")
	t.Setenv("MCP_STUDIO_DATABASE_URL", "")
	err := Run(Options{})
	if err == nil || !strings.Contains(err.Error(), "HTTPS required") {
		t.Fatalf("cloud edition accepted an insecure origin without an override: %v", err)
	}
}
