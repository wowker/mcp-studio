//go:build local

package platform

import "testing"

// Local startup path: the edition identifier alone determines loopback HTTP and
// the local subject, so the former standalone switches no longer define
// behavior. Real startup sequencing is E05; the entry must say so instead of
// pretending the edition is usable.
func TestLocalEditionStartupPath(t *testing.T) {
	if CurrentEdition != EditionLocal {
		t.Fatalf("local build tag must select the local edition, got %s", CurrentEdition)
	}
	policy := PolicyFor(CurrentEdition)
	if !policy.AllowInsecureLoopback || policy.ReadBootstrapCredential {
		t.Fatalf("local edition policy is not edition-driven: %+v", policy)
	}
	clearSettingsEnv(t)
	t.Setenv("MCP_STUDIO_ALLOW_INSECURE_LOOPBACK", "false")
	t.Setenv("MCP_STUDIO_INIT_CREDENTIAL", "fixture-init")
	settings, err := loadSettings(nil)
	if err != nil {
		t.Fatal(err)
	}
	if !settings.AllowInsecure(CurrentEdition) {
		t.Fatal("legacy loopback switch disabled the local edition")
	}
	if err = RunLocal(Options{}); err == nil {
		t.Fatal("local startup must not report success before E05")
	}
}
