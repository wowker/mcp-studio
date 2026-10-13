package mcpclient

import (
	"context"
	"encoding/json"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func fixtureServer() *mcp.Server {
	s := mcp.NewServer(&mcp.Implementation{Name: "controlled", Version: "1"}, nil)
	s.AddTool(&mcp.Tool{Name: "echo", InputSchema: map[string]any{"type": "object", "properties": map[string]any{"value": map[string]any{"type": "string"}}, "required": []string{"value"}}}, func(ctx context.Context, r *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var a map[string]any
		json.Unmarshal(r.Params.Arguments, &a)
		if os.Getenv("AGENT_MCP_FIXTURE") == "1" {
			if a["value"] == "exit" {
				os.Exit(2)
			}
			if a["value"] == "delay" {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(time.Second):
				}
			}
		}
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: a["value"].(string)}}}, nil
	})
	return s
}
func TestControlledStdioFixture(t *testing.T) {
	if os.Getenv("AGENT_MCP_FIXTURE") != "1" {
		return
	}
	fixtureServer().Run(context.Background(), &mcp.StdioTransport{})
	os.Exit(0)
}
func TestActualSDKHTTPAndSSE(t *testing.T) {
	for _, transport := range []string{"streamable-http", "sse"} {
		t.Run(transport, func(t *testing.T) {
			s := fixtureServer()
			var h http.Handler
			if transport == "sse" {
				h = mcp.NewSSEHandler(func(*http.Request) *mcp.Server { return s }, nil)
			} else {
				h = mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return s }, nil)
			}
			up := httptest.NewServer(h)
			defer up.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			session, err := Connect(ctx, wire.Connection{ID: "c", ProjectID: "p", Transport: transport, Channel: "agent", Endpoint: up.URL}, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer session.Close()
			tools, err := session.ListTools(ctx)
			if err != nil || len(tools.Tools) != 1 {
				t.Fatalf("%v %v", tools, err)
			}
			result, httpStatus, err := session.CallWithStatus(ctx, "echo", `{"value":"real protocol"}`)
			if httpStatus != 200 && httpStatus != 202 {
				t.Fatal("missing actual call HTTP status", httpStatus)
			}
			if err != nil || result.IsError || result.Content[0].(*mcp.TextContent).Text != "real protocol" {
				t.Fatalf("%v %v", result, err)
			}
		})
	}
}
func TestActualSDKStdio(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	session, err := Connect(ctx, wire.Connection{ID: "c", ProjectID: "p", Transport: "stdio", Channel: "agent", Command: os.Args[0], Args: []string{"-test.run=TestControlledStdioFixture"}, Env: []wire.ConfigEntry{{Name: "AGENT_MCP_FIXTURE", Value: "1"}}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	r, err := session.Call(ctx, "echo", `{"value":"literal ; $(no shell)"}`)
	if err != nil || r.Content[0].(*mcp.TextContent).Text != "literal ; $(no shell)" {
		t.Fatalf("%v %v", r, err)
	}
}
func TestBrowserChannelNeverFallback(t *testing.T) {
	if _, err := Connect(context.Background(), wire.Connection{Transport: "streamable-http", Channel: "browser", Endpoint: "http://127.0.0.1"}, nil); err == nil {
		t.Fatal("implicit fallback")
	}
}
func TestStdioExitAndTimeoutAreProtocolFailures(t *testing.T) {
	for _, value := range []string{"delay", "exit"} {
		t.Run(value, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			session, err := Connect(ctx, wire.Connection{ID: "c", ProjectID: "p", Transport: "stdio", Channel: "agent", Command: os.Args[0], Args: []string{"-test.run=TestControlledStdioFixture"}, Env: []wire.ConfigEntry{{Name: "AGENT_MCP_FIXTURE", Value: "1"}}}, nil)
			if err != nil {
				t.Fatal(err)
			}
			defer session.Close()
			callCtx, stop := context.WithTimeout(ctx, 30*time.Millisecond)
			defer stop()
			if _, err = session.Call(callCtx, "echo", `{"value":"`+value+`"}`); err == nil {
				t.Fatal("stdio failure fabricated success")
			}
			if session.HTTPStatus() != 0 {
				t.Fatal("stdio fabricated HTTP status")
			}
		})
	}
}
