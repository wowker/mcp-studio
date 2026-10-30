package process

import (
	"mcp-studio/internal/wire"
	"strings"
	"testing"
)

func TestCommandDoesNotUseShellOrInheritSecrets(t *testing.T) {
	t.Setenv("PLATFORM_SECRET", "must-not-inherit")
	c := wire.Connection{Command: "/bin/echo", Args: []string{"$(touch /tmp/not-executed)", "a;b"}, Cwd: "/tmp", Env: []wire.ConfigEntry{{Name: "EXPLICIT", Value: "yes"}}}
	cmd, err := Command(c)
	if err != nil {
		t.Fatal(err)
	}
	if cmd.Path != "/bin/echo" || cmd.Args[1] != c.Args[0] {
		t.Fatal("shell rewriting")
	}
	for _, v := range cmd.Env {
		if strings.HasPrefix(v, "PLATFORM_SECRET=") {
			t.Fatal("secret inherited")
		}
	}
	out, err := cmd.Output()
	if err != nil || !strings.Contains(string(out), c.Args[0]) {
		t.Fatalf("%q %v", out, err)
	}
	c.Cwd = "relative"
	if _, err = Command(c); err == nil {
		t.Fatal("relative cwd")
	}
}
