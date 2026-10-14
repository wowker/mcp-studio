// This test entry links production Agent modules. It injects only controlled
// native consent, a test master-key store and the temporary fixture CA.
package main

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"io"
	"mcp-studio/internal/agent/localapi"
	"mcp-studio/internal/agent/oauth"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/queue"
	"mcp-studio/internal/agent/sessions"
	"mcp-studio/internal/agent/vault"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

type fixtureKeys struct{ root, control string }

func (k fixtureKeys) path(id string) string {
	sum := sha256.Sum256([]byte(id))
	return filepath.Join(k.root, hex.EncodeToString(sum[:]))
}
func (k fixtureKeys) check() error {
	if _, e := os.Stat(filepath.Join(k.control, "vault-unavailable")); e == nil {
		return vault.ErrUnavailable
	}
	return nil
}
func (k fixtureKeys) Read(_ context.Context, id string) ([]byte, error) {
	if e := k.check(); e != nil {
		return nil, e
	}
	v, e := os.ReadFile(k.path(id))
	if errors.Is(e, os.ErrNotExist) {
		return nil, vault.ErrKeyMissing
	}
	return v, e
}
func (k fixtureKeys) Create(_ context.Context, id string, value []byte) error {
	if e := k.check(); e != nil {
		return e
	}
	f, e := os.OpenFile(k.path(id), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if errors.Is(e, os.ErrExist) {
		return vault.ErrKeyExists
	}
	if e != nil {
		return e
	}
	defer f.Close()
	_, e = f.Write(value)
	return e
}
func (k fixtureKeys) Delete(_ context.Context, id string) error {
	if e := k.check(); e != nil {
		return e
	}
	e := os.Remove(k.path(id))
	if errors.Is(e, os.ErrNotExist) {
		return nil
	}
	return e
}

type fixturePlatformTransport struct {
	base    http.RoundTripper
	control string
}

func (f fixturePlatformTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	// Observe only public metadata. Forward both attempts to the real platform;
	// passwords, token payloads, grants and response bodies never enter the log.
	if r.Method == http.MethodPost && filepath.Base(r.URL.Path) == "credential-backups" {
		summary := map[string]any{"type": "backup"}
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) == 7 {
			summary["projectId"], summary["connectionId"] = parts[3], parts[5]
		}
		if r.GetBody != nil {
			body, err := r.GetBody()
			if err == nil {
				var input struct {
					Kind            string `json:"kind"`
					ReferenceID     string `json:"referenceId"`
					SourceDigest    string `json:"sourceDigest"`
					ValueJSON       string `json:"valueJSON"`
					ExpectedVersion int    `json:"expectedVersion"`
				}
				if json.NewDecoder(body).Decode(&input) == nil {
					sum := sha256.Sum256([]byte(input.ValueJSON))
					summary["kind"], summary["referenceId"] = input.Kind, input.ReferenceID
					summary["sourceDigest"], summary["expectedVersion"] = input.SourceDigest, input.ExpectedVersion
					summary["sourceDigestMatchesValue"] = input.SourceDigest == hex.EncodeToString(sum[:])
				}
				body.Close()
			}
		}
		response, err := f.base.RoundTrip(r)
		if err == nil {
			summary["status"] = response.StatusCode
			event(summary)
		}
		return response, err
	}
	if filepath.Base(r.URL.Path) == "record-uploads" {
		summary := map[string]any{"type": "upload"}
		if r.GetBody != nil {
			body, e := r.GetBody()
			if e == nil {
				var input struct {
					OperationID  string `json:"operationId"`
					TargetID     string `json:"targetId"`
					FrozenDigest string `json:"frozenDigest"`
				}
				json.NewDecoder(body).Decode(&input)
				body.Close()
				summary["operationId"] = input.OperationID
				summary["targetId"] = input.TargetID
				summary["frozenDigest"] = input.FrozenDigest
			}
		}
		if _, e := os.Stat(filepath.Join(f.control, "fail-uploads")); e == nil {
			summary["status"] = 503
			event(summary)
			return &http.Response{StatusCode: 503, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"error":{"code":"fixture_upload_unavailable"}}`)), Request: r}, nil
		}
		response, e := f.base.RoundTrip(r)
		if e == nil {
			summary["status"] = response.StatusCode
			event(summary)
		}
		return response, e
	}
	return f.base.RoundTrip(r)
}
func event(value any) { json.NewEncoder(os.Stdout).Encode(value) }
func run() error {
	root, origin, listen, control, cert := os.Getenv("FIXTURE_AGENT_ROOT"), os.Getenv("FIXTURE_PLATFORM_ORIGIN"), os.Getenv("FIXTURE_AGENT_LISTEN"), os.Getenv("FIXTURE_AGENT_CONTROL"), os.Getenv("FIXTURE_CA_FILE")
	for _, dir := range []string{root, control, filepath.Join(root, "master-store")} {
		if e := os.MkdirAll(dir, 0700); e != nil {
			return e
		}
	}
	raw, e := os.ReadFile(cert)
	if e != nil {
		return e
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(raw) {
		return errors.New("fixture_ca_invalid")
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.TLSClientConfig = &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}
	defer transport.CloseIdleConnections()
	httpClient := &http.Client{Transport: transport, Timeout: 15 * time.Second}
	platform, e := platformclient.New(origin, &http.Client{Transport: fixturePlatformTransport{transport, control}, Timeout: 15 * time.Second})
	if e != nil {
		return e
	}
	keys := fixtureKeys{filepath.Join(root, "master-store"), control}
	device := "m5-controlled-device"
	data := filepath.Join(root, "encrypted-data")
	store, e := vault.NewStore(data, device, keys)
	if e != nil {
		return e
	}
	defer store.Close()
	q, e := queue.New(data, device, keys)
	if e != nil {
		return e
	}
	defer q.Close()
	confirm := func(ctx context.Context, p pairing.Prompt) (bool, error) {
		if p.Command != "" {
			event(map[string]any{"type": "native-process", "command": p.Command, "args": p.Args, "cwd": p.Cwd, "environmentNames": p.EnvironmentNames})
			return true, nil
		}
		event(map[string]any{"type": "native-pairing", "challengeId": p.Challenge.ChallengeID, "code": p.Code, "origin": p.Challenge.Origin, "userId": p.Challenge.UserID, "deviceId": p.Challenge.DeviceID, "capabilities": p.Challenge.Capabilities})
		return true, nil
	}
	engine := sessions.New(sessions.Config{Platform: platform, Queue: q, Vault: store, Confirm: confirm, OAuth: oauth.New(httpClient), HTTPClient: httpClient})
	defer engine.Close()
	api, e := localapi.New(localapi.Config{Origin: origin, Host: listen, DeviceID: device, Platform: platform, Confirm: confirm, Engine: engine, IsVaultAvailable: store.Available, QueueMode: q.Mode, QueueRetention: "encrypted"})
	if e != nil {
		return e
	}
	listener, e := localapi.Listen(listen)
	if e != nil {
		return e
	}
	server := &http.Server{Handler: api, ReadHeaderTimeout: 5 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	event(map[string]any{"type": "ready"})
	select {
	case e = <-done:
		if !errors.Is(e, http.ErrServerClosed) {
			return e
		}
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		server.Shutdown(shutdown)
	}
	return nil
}
func stdio() error {
	if len(os.Args) != 3 {
		return errors.New("stdio_counter_required")
	}
	counter := os.Args[2]
	server := mcp.NewServer(&mcp.Implementation{Name: "m5-stdio-fixture", Version: "1"}, nil)
	type input struct {
		Text string `json:"text"`
	}
	type output struct {
		Text string `json:"text"`
	}
	mcp.AddTool(server, &mcp.Tool{Name: "echo", Description: "Controlled real stdio echo"}, func(ctx context.Context, req *mcp.CallToolRequest, in input) (*mcp.CallToolResult, output, error) {
		r, e := http.NewRequestWithContext(ctx, "POST", counter+"/stdio-call", nil)
		if e != nil {
			return nil, output{}, e
		}
		response, e := http.DefaultClient.Do(r)
		if e != nil {
			return nil, output{}, e
		}
		response.Body.Close()
		if response.StatusCode != 200 {
			return nil, output{}, errors.New("counter_unavailable")
		}
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: in.Text}}}, output{in.Text}, nil
	})
	return server.Run(context.Background(), &mcp.StdioTransport{})
}
func main() {
	var e error
	if len(os.Args) > 1 && os.Args[1] == "stdio" {
		e = stdio()
	} else {
		e = run()
	}
	if e != nil {
		fmt.Fprintln(os.Stderr, "Controlled Agent fixture failed")
		os.Exit(1)
	}
}
