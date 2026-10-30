// Package process creates an explicit program/argument invocation with a minimal environment.
package process

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"mcp-studio/internal/wire"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func Command(c wire.Connection) (*exec.Cmd, error) {
	if c.Command == "" || strings.ContainsAny(c.Command, "\x00\r\n") || c.Cwd != "" && !filepath.IsAbs(c.Cwd) {
		return nil, errors.New("invalid_process_configuration")
	}
	for _, a := range c.Args {
		if strings.ContainsRune(a, 0) {
			return nil, errors.New("invalid_argument")
		}
	}
	cmd := exec.Command(c.Command, c.Args...)
	cmd.Dir = c.Cwd
	cmd.Env = []string{}
	for _, name := range []string{"PATH", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "SystemRoot", "WINDIR"} {
		if value, ok := os.LookupEnv(name); ok {
			cmd.Env = append(cmd.Env, name+"="+value)
		}
	}
	for _, e := range c.Env {
		if strings.ContainsAny(e.Name, "=\x00\r\n") || e.Name == "" || strings.ContainsRune(e.Value, 0) {
			return nil, errors.New("invalid_environment")
		}
		prefix := e.Name + "="
		filtered := cmd.Env[:0]
		for _, v := range cmd.Env {
			if !strings.HasPrefix(v, prefix) {
				filtered = append(filtered, v)
			}
		}
		cmd.Env = append(filtered, prefix+e.Value)
	}
	return cmd, nil
}

// Fingerprint includes immutable configuration and variable definition versions, not only URL.
func Fingerprint(c wire.Connection, variables []wire.Variable) string {
	b, _ := json.Marshal(struct {
		Connection wire.Connection
		Variables  []wire.Variable
	}{c, variables})
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}
