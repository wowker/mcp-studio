package sessions

import (
	"context"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/wire"
	"os"
	"sync/atomic"
	"testing"
)

func TestControlledEngineStdioFixture(t *testing.T) {
	if os.Getenv("AGENT_ENGINE_FIXTURE") != "1" {
		return
	}
	server := sdk.NewServer(&sdk.Implementation{Name: "engine-stdio", Version: "1"}, nil)
	server.AddTool(&sdk.Tool{Name: "env", InputSchema: map[string]any{"type": "object"}}, func(context.Context, *sdk.CallToolRequest) (*sdk.CallToolResult, error) {
		return &sdk.CallToolResult{Content: []sdk.Content{&sdk.TextContent{Text: os.Getenv("PARENT_PLATFORM_SECRET")}}}, nil
	})
	server.Run(context.Background(), &sdk.StdioTransport{})
	os.Exit(0)
}
func TestStdioFirstAndChangedConfigurationRequireNativeApproval(t *testing.T) {
	t.Setenv("PARENT_PLATFORM_SECRET", "must-not-inherit")
	a := &authority{a: platformclient.Authorized{Connection: wire.Connection{ID: "c", ProjectID: "p", Name: "stdio", Version: 1, Transport: "stdio", Channel: "agent", AuthMode: "none", Command: os.Args[0], Args: []string{"-test.run=TestControlledEngineStdioFixture"}, Env: []wire.ConfigEntry{{Name: "AGENT_ENGINE_FIXTURE", Value: "1"}}, Headers: []wire.ConfigEntry{}, OauthScopes: []string{}, TimeoutMs: 2000}}}
	var approvals atomic.Int32
	allow := false
	e := New(Config{Platform: a, Confirm: func(ctx context.Context, p pairing.Prompt) (bool, error) {
		approvals.Add(1)
		if p.Command != os.Args[0] || len(p.EnvironmentNames) != 1 {
			t.Error("approval did not show exact launch")
		}
		return allow, nil
	}})
	defer e.Close()
	s := pairing.Session{UserID: "u", PairingID: "pair", Grant: pairing.Grant{UserID: "u"}}
	in := agentwire.AgentConnectInput{ProjectID: "p", ConnectionID: "c", Version: 1}
	if _, err := e.Connect(context.Background(), s, in); err == nil {
		t.Fatal("local denial ignored")
	}
	allow = true
	if _, err := e.Connect(context.Background(), s, in); err != nil {
		t.Fatal(err)
	}
	c := e.connections[key("u", "p", "c")]
	result, err := c.session.Call(context.Background(), "env", `{}`)
	if err != nil || result.Content[0].(*sdk.TextContent).Text != "" {
		t.Fatal("inherited platform secret", err)
	}
	if _, err = e.Connect(context.Background(), s, in); err != nil || approvals.Load() != 2 {
		t.Fatal("unchanged config approval", err, approvals.Load())
	}
	a.a.Connection.Version = 2
	in.Version = 2
	allow = false
	if _, err = e.Connect(context.Background(), s, in); err == nil || approvals.Load() != 3 {
		t.Fatal("config change bypassed native approval")
	}
}
