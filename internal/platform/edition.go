package platform

// Edition identifies the distribution served by this build. The single-binary
// local edition is selected with the `local` build tag; every other build is
// the cloud service edition, so existing deployment and gates stay unchanged.
type Edition string

const (
	EditionCloud Edition = "cloud"
	EditionLocal Edition = "local"
)

// EditionPolicy is behavior fixed by the distribution rather than by an ad-hoc
// environment switch. It replaces the former standalone meaning of
// MCP_STUDIO_ALLOW_INSECURE_LOOPBACK and MCP_STUDIO_INIT_CREDENTIAL.
type EditionPolicy struct {
	// AllowInsecureLoopback permits plain HTTP on loopback without an explicit
	// operator override. The local edition is loopback-only by design.
	AllowInsecureLoopback bool
	// ReadBootstrapCredential reports whether the edition consumes
	// MCP_STUDIO_INIT_CREDENTIAL. The local edition initializes its own local
	// subject and ignores the variable.
	ReadBootstrapCredential bool
}

func PolicyFor(edition Edition) EditionPolicy {
	if edition == EditionLocal {
		return EditionPolicy{AllowInsecureLoopback: true, ReadBootstrapCredential: false}
	}
	return EditionPolicy{AllowInsecureLoopback: false, ReadBootstrapCredential: true}
}

// AllowInsecure reports the effective loopback policy: the edition default
// combined with an explicit operator override.
func (s Settings) AllowInsecure(edition Edition) bool {
	return s.AllowInsecureLoopback || PolicyFor(edition).AllowInsecureLoopback
}
