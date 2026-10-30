//go:build linux

package vault

import (
	"context"
	"encoding/hex"
	"os"
	"os/exec"
	"strings"
	"time"
)

type systemMasterStore struct{}

func NewSystemMasterStore() MasterStore { return systemMasterStore{} }
func secretCommand(ctx context.Context, args ...string) *exec.Cmd {
	c := exec.CommandContext(ctx, "/usr/bin/secret-tool", args...)
	c.Env = []string{"PATH=/usr/bin:/bin"}
	for _, key := range []string{"HOME", "LANG", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "DISPLAY"} {
		if value, ok := os.LookupEnv(key); ok {
			c.Env = append(c.Env, key+"="+value)
		}
	}
	return c
}
func (systemMasterStore) Read(ctx context.Context, id string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	raw, err := secretCommand(ctx, "lookup", "application", "mcp-studio.agent.master.v1", "account", Hash([]byte(id))).Output()
	if err != nil {
		if e, ok := err.(*exec.ExitError); ok && e.ExitCode() == 1 && len(raw) == 0 {
			return nil, ErrKeyMissing
		}
		return nil, ErrUnavailable
	}
	if len(raw) > 128 {
		return nil, ErrUnavailable
	}
	key, err := hex.DecodeString(strings.TrimSpace(string(raw)))
	if err != nil || len(key) != 32 {
		return nil, ErrUnavailable
	}
	return key, nil
}
func (s systemMasterStore) Create(ctx context.Context, id string, key []byte) error {
	if len(key) != 32 {
		return ErrUnavailable
	}
	if _, err := s.Read(ctx, id); err == nil {
		return ErrKeyExists
	} else if err != ErrKeyMissing {
		return ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	c := secretCommand(ctx, "store", "--label=MCP Studio Agent master key", "application", "mcp-studio.agent.master.v1", "account", Hash([]byte(id)))
	c.Stdin = strings.NewReader(hex.EncodeToString(key))
	if err := c.Run(); err != nil {
		return ErrUnavailable
	}
	return nil
}
func (systemMasterStore) Delete(ctx context.Context, id string) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := secretCommand(ctx, "clear", "application", "mcp-studio.agent.master.v1", "account", Hash([]byte(id))).Run(); err != nil {
		return ErrUnavailable
	}
	return nil
}
