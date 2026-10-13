// Package mcpclient uses the pinned Go SDK for real HTTP/SSE and command sessions.
package mcpclient

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"io"
	"mcp-studio/internal/agent/process"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/wire"
	"net/http"
	"net/url"
	"sync"
	"time"
)

type Session struct {
	client   *mcp.ClientSession
	observer *headersTransport
}
type observationKey struct{}
type callObservation struct {
	mu     sync.Mutex
	status int
}
type headersTransport struct {
	base    http.RoundTripper
	headers http.Header
	origin  *url.URL
	mu      sync.Mutex
	status  int
}

func (t *headersTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if r.URL.Scheme != t.origin.Scheme || r.URL.Host != t.origin.Host || r.URL.User != nil {
		return nil, errors.New("mcp_cross_origin_rejected")
	}
	for key := range r.URL.Query() {
		if recording.SensitiveName(key) {
			return nil, errors.New("secret_in_url")
		}
	}
	clone := r.Clone(r.Context())
	clone.Header = r.Header.Clone()
	for k, v := range t.headers {
		clone.Header[k] = append([]string{}, v...)
	}
	response, err := t.base.RoundTrip(clone)
	if err == nil {
		if observation, ok := r.Context().Value(observationKey{}).(*callObservation); ok && r.Method == "POST" && r.GetBody != nil {
			body, bodyErr := r.GetBody()
			if bodyErr == nil {
				var message struct {
					Method string `json:"method"`
				}
				json.NewDecoder(io.LimitReader(body, (1<<20)+16384)).Decode(&message)
				body.Close()
				if message.Method == "tools/call" {
					observation.mu.Lock()
					observation.status = response.StatusCode
					observation.mu.Unlock()
				}
			}
		}
	}
	if err == nil {
		t.mu.Lock()
		t.status = response.StatusCode
		t.mu.Unlock()
		if response.ContentLength > 12<<20 {
			response.Body.Close()
			return nil, errors.New("response_limit")
		}
		response.Body = &boundedBody{ReadCloser: response.Body, remaining: 12 << 20}
	}
	return response, err
}

type boundedBody struct {
	io.ReadCloser
	remaining int64
}

func (b *boundedBody) Read(p []byte) (int, error) {
	if b.remaining <= 0 {
		return 0, errors.New("response_limit")
	}
	if int64(len(p)) > b.remaining {
		p = p[:b.remaining]
	}
	n, err := b.ReadCloser.Read(p)
	b.remaining -= int64(n)
	return n, err
}
func Connect(ctx context.Context, c wire.Connection, headers http.Header) (*Session, error) {
	return ConnectWithHTTPClient(ctx, c, headers, nil)
}
func ConnectWithHTTPClient(ctx context.Context, c wire.Connection, headers http.Header, provided *http.Client) (*Session, error) {
	if c.Channel != "agent" {
		return nil, errors.New("explicit_agent_channel_required")
	}
	var transport mcp.Transport
	var observer *headersTransport
	switch c.Transport {
	case "stdio":
		cmd, err := process.Command(c)
		if err != nil {
			return nil, err
		}
		transport = &mcp.CommandTransport{Command: cmd, TerminateDuration: 250 * time.Millisecond}
	case "streamable-http", "sse":
		u, err := url.Parse(c.Endpoint)
		if err != nil || u.Host == "" || u.User != nil || u.Fragment != "" || (u.Scheme != "https" && u.Scheme != "http") {
			return nil, errors.New("invalid_mcp_endpoint")
		}
		base := http.DefaultTransport
		if provided != nil && provided.Transport != nil {
			base = provided.Transport
		}
		observer = &headersTransport{base: base, headers: headers.Clone(), origin: u}
		client := &http.Client{Transport: observer, CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("mcp_redirect_rejected") }}
		if c.Transport == "sse" {
			transport = &mcp.SSEClientTransport{Endpoint: c.Endpoint, HTTPClient: client}
		} else {
			transport = &mcp.StreamableClientTransport{Endpoint: c.Endpoint, HTTPClient: client, MaxRetries: -1, DisableStandaloneSSE: true}
		}
	default:
		return nil, errors.New("unsupported_transport")
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "MCP Studio Agent", Version: "1.0.0"}, nil)
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return nil, errors.New("mcp_connect_failed")
	}
	return &Session{session, observer}, nil
}
func (s *Session) Close() error                { return s.client.Close() }
func (s *Session) Info() *mcp.InitializeResult { return s.client.InitializeResult() }
func (s *Session) HTTPStatus() int {
	if s.observer == nil {
		return 0
	}
	s.observer.mu.Lock()
	defer s.observer.mu.Unlock()
	return s.observer.status
}
func (s *Session) ListTools(ctx context.Context) (*mcp.ListToolsResult, error) {
	result := &mcp.ListToolsResult{Tools: []*mcp.Tool{}}
	seen := map[string]bool{}
	cursor := ""
	for page := 0; page < 32; page++ {
		r, err := s.client.ListTools(ctx, &mcp.ListToolsParams{Cursor: cursor})
		if err != nil {
			return nil, errors.New("mcp_tools_failed")
		}
		result.Tools = append(result.Tools, r.Tools...)
		b, _ := json.Marshal(result)
		if len(result.Tools) > 256 || len(b) > 1<<20 {
			return nil, errors.New("tools_limit")
		}
		if r.NextCursor == "" {
			return result, nil
		}
		if seen[r.NextCursor] {
			return nil, errors.New("tools_cursor_cycle")
		}
		seen[r.NextCursor] = true
		cursor = r.NextCursor
	}
	return nil, errors.New("tools_limit")
}
func (s *Session) Call(ctx context.Context, name, argumentsJSON string) (*mcp.CallToolResult, error) {
	result, _, err := s.CallWithStatus(ctx, name, argumentsJSON)
	return result, err
}

func (s *Session) CallWithStatus(ctx context.Context, name, argumentsJSON string) (*mcp.CallToolResult, int, error) {
	observation := &callObservation{}
	ctx = context.WithValue(ctx, observationKey{}, observation)
	result, err := s.client.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: json.RawMessage(argumentsJSON)})
	observation.mu.Lock()
	status := observation.status
	observation.mu.Unlock()
	return result, status, err
}
