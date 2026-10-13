// Package sessions owns explicitly connected MCP sessions and autonomous, frozen Agent runs.
package sessions

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"mcp-studio/internal/agent/localapi"
	mcpclient "mcp-studio/internal/agent/mcp"
	"mcp-studio/internal/agent/oauth"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/process"
	"mcp-studio/internal/agent/vault"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/configuration"
	"mcp-studio/internal/environment"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/schema"
	"mcp-studio/internal/wire"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Platform interface {
	Authorize(context.Context, pairing.Grant, platformclient.ConnectionRequest, string) (platformclient.Authorized, error)
}
type Queue interface {
	Admit(context.Context, string, string) error
	Enqueue(context.Context, wire.RecordUploadInput) error
}
type Values interface {
	Resolve(context.Context, pairing.Grant, platformclient.Authorized) (map[string]any, string, []string, error)
}
type Config struct {
	Now        func() time.Time
	HTTPClient *http.Client
	Vault      *vault.Store
	OAuth      *oauth.Manager
	Platform   Platform
	Queue      Queue
	Confirm    pairing.ConfirmLocal
	Values     Values
	Extra      func(http.ResponseWriter, *http.Request, pairing.Session) bool
}
type connected struct {
	session     *mcpclient.Session
	config      wire.Connection
	fingerprint string
	tools       map[string]*sdk.Tool
	secrets     []string
	state       agentwire.AgentConnectionState
	pairingID   string
	outstanding int
	revoked     bool
}
type running struct {
	completedAt time.Time
	recordedAt  time.Time
	state       agentwire.AgentRunState
	cancel      context.CancelFunc
	pairingID   string
}
type Engine struct {
	background    context.Context
	stop          context.CancelFunc
	workers       sync.WaitGroup
	cacheSweep    sync.Once
	config        Config
	mu            sync.Mutex
	connections   map[string]*connected
	runs          map[string]*running
	approved      map[string]string
	oauthBindings map[string]oauth.Binding
}

func New(c Config) *Engine {
	if c.OAuth == nil {
		c.OAuth = oauth.New(nil)
	}
	if c.Values == nil && c.Vault != nil {
		c.Values = storeValues{c.Vault}
	}
	background, stop := context.WithCancel(context.Background())
	return &Engine{background: background, stop: stop, config: c, connections: map[string]*connected{}, runs: map[string]*running{}, approved: map[string]string{}, oauthBindings: map[string]oauth.Binding{}}
}
func key(uid, pid, cid string) string { return uid + "\x00" + pid + "\x00" + cid }
func id() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("CSPRNG unavailable")
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
func request(in agentwire.AgentConnectInput) platformclient.ConnectionRequest {
	return platformclient.ConnectionRequest{ProjectID: in.ProjectID, ConnectionID: in.ConnectionID, Version: in.Version, EnvironmentID: in.EnvironmentID}
}
func (e *Engine) resolve(ctx context.Context, s pairing.Session, a platformclient.Authorized) (wire.Connection, []string, error) {
	c := a.Connection
	if code := configuration.ValidateConnection(wire.ConnectionInput{Name: c.Name, Transport: c.Transport, Channel: c.Channel, Endpoint: c.Endpoint, Command: c.Command, Args: c.Args, Cwd: c.Cwd, Headers: c.Headers, Env: c.Env, TimeoutMs: c.TimeoutMs, EnvironmentID: c.EnvironmentID, AuthMode: c.AuthMode, AuthReferenceID: c.AuthReferenceID, OauthClientID: c.OauthClientID, OauthScopes: c.OauthScopes}); code != "" {
		return c, nil, errors.New(code)
	}
	personal := map[string]any{}
	bearer := ""
	secrets := []string{}
	if e.config.Values != nil {
		var err error
		personal, bearer, secrets, err = e.config.Values.Resolve(ctx, s.Grant, a)
		if err != nil {
			return c, nil, err
		}
	}
	layers := environment.BuildLayers(a.Variables, c.ProjectID, c.ID, c.EnvironmentID)
	resolved := environment.Resolve(environment.Input{Layers: layers, Personal: personal})
	if resolved.Error != "" {
		return c, nil, errors.New("environment_invalid")
	}
	var substituteErr error
	substitute := func(text string) string {
		return environment.Reference.ReplaceAllStringFunc(text, func(ref string) string {
			v, ok := resolved.Read(ref[2 : len(ref)-2])
			if !ok || environment.Empty(v.Value) {
				substituteErr = errors.New("environment_value_missing")
				return ""
			}
			if v.Sensitive {
				secrets = append(secrets, recording.StringLeaves(v.Value)...)
			}
			if s, ok := v.Value.(string); ok {
				return s
			}
			b, _ := json.Marshal(v.Value)
			return string(b)
		})
	}
	c.Endpoint = substitute(c.Endpoint)
	c.Command = substitute(c.Command)
	c.Cwd = substitute(c.Cwd)
	c.Args = append([]string{}, c.Args...)
	for i := range c.Args {
		c.Args[i] = substitute(c.Args[i])
	}
	c.Env = append([]wire.ConfigEntry{}, c.Env...)
	for i := range c.Env {
		c.Env[i].Value = substitute(c.Env[i].Value)
	}
	c.Headers = append([]wire.ConfigEntry{}, c.Headers...)
	for i := range c.Headers {
		c.Headers[i].Value = substitute(c.Headers[i].Value)
	}
	if c.AuthMode == "reference" {
		value, ok := personal[c.AuthReferenceID]
		bearer, _ = value.(string)
		if !ok || bearer == "" {
			return c, nil, errors.New("credential_missing")
		}
	}
	if c.AuthMode == "token" || c.AuthMode == "oauth" || c.AuthMode == "reference" {
		if bearer == "" {
			return c, nil, errors.New("credential_missing")
		}
		c.Headers = append(c.Headers, wire.ConfigEntry{Name: "Authorization", Value: "Bearer " + bearer})
		secrets = append(secrets, bearer)
	}
	decodedEndpoint, decodeErr := url.QueryUnescape(c.Endpoint)
	if decodeErr != nil {
		return c, nil, errors.New("invalid_endpoint")
	}
	for _, secret := range secrets {
		if secret != "" && (strings.Contains(c.Endpoint, secret) || strings.Contains(decodedEndpoint, secret) || strings.Contains(c.Command, secret) || strings.Contains(c.Cwd, secret)) {
			return c, nil, errors.New("secret_in_url")
		}
	}
	if substituteErr != nil {
		return c, nil, substituteErr
	}
	return c, secrets, nil
}
func (e *Engine) Connect(ctx context.Context, s pairing.Session, in agentwire.AgentConnectInput) (agentwire.AgentConnectionState, error) {
	state := agentwire.AgentConnectionState{ProjectID: in.ProjectID, ConnectionID: in.ConnectionID, UserID: s.UserID, Version: in.Version, EnvironmentID: in.EnvironmentID, Status: "failed"}
	a, err := e.config.Platform.Authorize(ctx, s.Grant, request(in), "")
	if err != nil {
		return state, err
	}
	if a.Connection.Channel != "agent" {
		return state, errors.New("explicit_agent_channel_required")
	}
	c, secrets, err := e.resolve(ctx, s, a)
	if err != nil {
		return state, err
	}
	k := key(s.UserID, in.ProjectID, in.ConnectionID)
	fingerprint := process.Fingerprint(a.Connection, a.Variables)
	if c.Transport == "stdio" {
		e.mu.Lock()
		approved := e.approved[k] == fingerprint
		e.mu.Unlock()
		if !approved {
			if e.config.Confirm == nil {
				return state, errors.New("local_confirmation_required")
			}
			names := []string{}
			for _, v := range c.Env {
				names = append(names, v.Name)
			}
			ok, err := e.config.Confirm(ctx, pairing.Prompt{Challenge: pairing.Challenge{Origin: s.Origin, UserID: s.UserID, DeviceID: s.DeviceID, Capabilities: []string{"stdio"}}, Command: c.Command, Args: safeArguments(c.Args, secrets), Cwd: c.Cwd, EnvironmentNames: names})
			if err != nil || !ok {
				return state, errors.New("local_denied")
			}
			e.mu.Lock()
			e.approved[k] = fingerprint
			e.mu.Unlock()
		}
	}
	timeout := time.Duration(c.TimeoutMs) * time.Millisecond
	connectCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	headers := http.Header{}
	for _, v := range c.Headers {
		headers.Set(v.Name, v.Value)
	}
	session, err := mcpclient.ConnectWithHTTPClient(connectCtx, c, headers, e.config.HTTPClient)
	if err != nil {
		return state, err
	}
	tools, err := session.ListTools(connectCtx)
	if err != nil {
		session.Close()
		return state, err
	}
	catalog := map[string]*sdk.Tool{}
	for _, tool := range tools.Tools {
		if tool == nil || tool.Name == "" {
			session.Close()
			return state, errors.New("invalid_tools")
		}
		if _, exists := catalog[tool.Name]; exists {
			session.Close()
			return state, errors.New("duplicate_tool")
		}
		catalog[tool.Name] = tool
	}
	state.Status = "connected"
	info := session.Info()
	if info != nil && info.ServerInfo != nil {
		state.ServerName = safeLabel(info.ServerInfo.Name, secrets)
		state.ServerVersion = safeLabel(info.ServerInfo.Version, secrets)
	}
	next := &connected{session, c, fingerprint, catalog, secrets, state, s.PairingID, 0, false}
	e.mu.Lock()
	old := e.connections[k]
	e.connections[k] = next
	e.mu.Unlock()
	if old != nil {
		old.session.Close()
	}
	return state, nil
}
func (e *Engine) Run(ctx context.Context, s pairing.Session, in agentwire.AgentRunInput) (agentwire.AgentRunState, error) {
	empty := agentwire.AgentRunState{}
	if len(in.ArgumentsJSON) > 1<<20 || in.TabID == "" || len(in.TabID) > 128 || strings.ContainsAny(in.TabID, "/\\?#%\x00\r\n") {
		return empty, errors.New("invalid_run")
	}
	a, err := e.config.Platform.Authorize(ctx, s.Grant, platformclient.ConnectionRequest{ProjectID: in.ProjectID, ConnectionID: in.ConnectionID, Version: in.Version, EnvironmentID: in.EnvironmentID}, "execute")
	if err != nil {
		return empty, err
	}
	e.mu.Lock()
	c := e.connections[key(s.UserID, in.ProjectID, in.ConnectionID)]
	e.mu.Unlock()
	if c == nil || c.pairingID != s.PairingID || c.fingerprint != process.Fingerprint(a.Connection, a.Variables) {
		return empty, errors.New("manual_reconnect_required")
	}
	tool := c.tools[in.ToolName]
	if tool == nil {
		return empty, errors.New("tool_missing")
	}
	schemaBytes, err := json.Marshal(tool.InputSchema)
	if err != nil {
		return empty, errors.New("schema_invalid")
	}
	check := schema.Check(string(schemaBytes), in.ArgumentsJSON)
	if !check.Supported || !check.Valid {
		return empty, errors.New("schema_invalid")
	}
	args, err := recording.Parse(in.ArgumentsJSON, false)
	if err != nil {
		return empty, errors.New("invalid_json")
	}
	if _, ok := args.(map[string]any); !ok {
		return empty, errors.New("arguments_object_required")
	}
	if e.config.Queue == nil {
		return empty, errors.New("queue_unavailable")
	}
	resolved, secrets, err := e.resolve(ctx, s, a)
	if err != nil {
		return empty, err
	}
	if process.Fingerprint(resolved, nil) != process.Fingerprint(c.config, nil) {
		return empty, errors.New("manual_reconnect_required")
	}
	if err = e.config.Queue.Admit(ctx, s.UserID, in.ProjectID); err != nil {
		return empty, err
	}
	secrets = append(secrets, c.secrets...)
	state := agentwire.AgentRunState{RunID: id(), RecordID: id(), OperationID: id(), UserID: s.UserID, ProjectID: in.ProjectID, ConnectionID: in.ConnectionID, TabID: in.TabID, Status: "running", UploadStatus: "pending"}
	if reserve, ok := e.config.Queue.(interface {
		Reserve(context.Context, string, string, string) error
	}); ok {
		if err := reserve.Reserve(ctx, s.UserID, in.ProjectID, state.RunID); err != nil {
			return empty, err
		}
	}
	runCtx, cancel := context.WithTimeout(e.background, time.Duration(c.config.TimeoutMs)*time.Millisecond)
	run := &running{state: state, cancel: cancel, pairingID: s.PairingID}
	e.mu.Lock()
	if e.connections[key(s.UserID, in.ProjectID, in.ConnectionID)] != c || c.revoked {
		e.mu.Unlock()
		cancel()
		if reserve, ok := e.config.Queue.(interface{ Release(string, string, string) }); ok {
			reserve.Release(s.UserID, in.ProjectID, state.RunID)
		}
		return empty, errors.New("manual_reconnect_required")
	}
	c.outstanding++
	e.runs[state.RunID] = run
	e.mu.Unlock()
	started := time.Now().UTC().Format(time.RFC3339Nano)
	e.startCacheSweep()
	e.workers.Add(1)
	go e.execute(runCtx, s, run, c, in, a, string(schemaBytes), args, secrets, started)
	return state, nil
}
func (e *Engine) execute(ctx context.Context, s pairing.Session, run *running, c *connected, in agentwire.AgentRunInput, a platformclient.Authorized, schemaJSON string, args any, secrets []string, started string) {
	defer e.workers.Done()
	defer run.cancel()
	defer func() {
		e.mu.Lock()
		c.outstanding--
		shouldClose := c.revoked && c.outstanding == 0
		e.mu.Unlock()
		if shouldClose {
			c.session.Close()
		}
	}()
	result, httpStatus, err := c.session.CallWithStatus(ctx, in.ToolName, in.ArgumentsJSON)
	status, kind, outcome := "succeeded", "success", "known"
	response := any(result)
	diagnostic := ""
	if ctx.Err() != nil && err == nil {
		err = ctx.Err()
	}
	if err != nil {
		status = "failed"
		kind = "network_error"
		outcome = "unknown"
		diagnostic = "mcp_call_failed"
		var rpcError *jsonrpc.Error
		if errors.As(err, &rpcError) {
			kind = "rpc_error"
			outcome = "known"
			diagnostic = "mcp_rpc_error"
		} else if httpStatus >= 400 {
			kind = "http_error"
			diagnostic = "mcp_http_error"
		}
		response = nil
		if ctx.Err() == context.DeadlineExceeded {
			kind = "timeout"
			diagnostic = "timeout"
		}
		if ctx.Err() == context.Canceled {
			status = "cancelled"
			kind = "cancelled"
			diagnostic = "cancelled_waiting_remote_outcome_unknown"
		}
	} else if result.IsError {
		status = "failed"
		kind = "tool_error"
	}
	b, _ := json.Marshal(response)
	response, _ = recording.Parse(string(b), false)
	if len(b) > 10<<20 {
		response = nil
	}
	wrapper := map[string]any{"request": args, "response": response, "protocol": map[string]any{"transport": c.config.Transport, "executor": "agent", "httpStatus": httpStatus}}
	secrets = recording.SensitiveValues(wrapper, recording.Options{SecretValues: secrets, ProjectPointers: a.Policy.Pointers})
	safe, redactErr := recording.Redact(wrapper, recording.Options{SecretValues: secrets, ProjectPointers: a.Policy.Pointers})
	schemaValue := safeSchema(toolSchema(schemaJSON), secrets)
	snapshot := wire.ExecutionSnapshot{UserID: s.UserID, ProjectID: in.ProjectID, ConnectionID: in.ConnectionID, TabID: in.TabID, RunID: run.state.RunID, ToolName: safeLabel(in.ToolName, secrets), ConfigurationVersion: in.Version, ToolDefinitionVersion: hash(schemaJSON), EnvironmentID: in.EnvironmentID, EnvironmentVersion: hash(c.fingerprint), Executor: "agent", CredentialSource: c.config.AuthMode, InputSchemaJSON: encode(schemaValue), StartedAt: started, FinishedAt: time.Now().UTC().Format(time.RFC3339Nano), RunStatus: status, RemoteOutcome: outcome, ResultKind: kind, HttpStatus: httpStatus, ResponseRetention: "full", SchemaValid: true, Redactions: safe.Markers}
	if redactErr != nil || safe.Omitted {
		snapshot.RequestJSON = `{"$redacted":true}`
		snapshot.ResponseJSON = "null"
		snapshot.ProtocolJSON = "{}"
		snapshot.ResponseRetention = "omitted"
		snapshot.OmissionReason = "redaction_limit"
	} else {
		v := safe.Value.(map[string]any)
		snapshot.RequestJSON = encode(v["request"])
		snapshot.ResponseJSON = encode(v["response"])
		snapshot.ProtocolJSON = encode(v["protocol"])
	}
	if len(b) > 10<<20 {
		snapshot.ResponseRetention = "omitted"
		snapshot.OmissionReason = "response_limit"
	}
	input := wire.RecordUploadInput{ContractVersion: "1.2.0", UserID: s.UserID, ProjectID: in.ProjectID, ConnectionID: in.ConnectionID, OperationID: run.state.OperationID, TargetKind: "history", TargetID: run.state.RecordID, ResponsibleEndpoint: "agent", Snapshot: snapshot, Metadata: wire.RecordMetadata{Name: "Agent run", Visibility: "private", ContentKind: "request-response", Completeness: "complete"}}
	input.FrozenDigest, _ = recording.Digest(encode(input))
	queueErr := e.config.Queue.Enqueue(context.Background(), input)
	e.mu.Lock()
	run.completedAt = e.now()
	run.state.Status = status
	run.state.Diagnostic = diagnostic
	run.state.SnapshotJSON = encode(snapshot)
	if q := e.queueStore(); q != nil {
		if row, err := q.Get(context.Background(), s.UserID, input.OperationID); err == nil {
			run.state.Persisted = row.Persisted
			run.state.LossRisk = row.LossRisk
			run.state.UploadStatus = uploadStatus(row)
		}
	}
	if queueErr != nil {
		run.state.UploadStatus = "failed"
		run.state.Diagnostic = "queue_persistence_failed"
		run.state.LossRisk = true
	}
	e.pruneRunsLocked(e.now())
	e.mu.Unlock()
	if queueErr == nil {
		e.upload(s, input.OperationID, in.ProjectID)
	}
}
func toolSchema(raw string) any { var v any; json.Unmarshal([]byte(raw), &v); return v }
func encode(v any) string       { b, _ := json.Marshal(v); return string(b) }
func hash(s string) string      { v := sha256.Sum256([]byte(s)); return hex.EncodeToString(v[:]) }
func (e *Engine) RunState(s pairing.Session, id string) (agentwire.AgentRunState, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.pruneRunsLocked(e.now())
	r := e.runs[id]
	if r == nil || r.state.UserID != s.UserID {
		return agentwire.AgentRunState{}, errors.New("not_found")
	}
	state := r.state
	if q := e.queueStore(); q != nil {
		if row, err := q.Get(context.Background(), s.UserID, state.OperationID); err == nil {
			state.UploadStatus = uploadStatus(row)
			state.Persisted = row.Persisted
			state.LossRisk = row.LossRisk
		}
	}
	return state, nil
}
func (e *Engine) Cancel(s pairing.Session, id string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	r := e.runs[id]
	if r == nil || r.state.UserID != s.UserID {
		return errors.New("not_found")
	}
	if r.state.Status == "running" {
		r.cancel()
		r.state.Diagnostic = "cancelling_waiting_remote_outcome_unknown"
	}
	return nil
}
func (e *Engine) Unpair(s pairing.Session) {
	e.mu.Lock()
	var close []*mcpclient.Session
	for k, c := range e.connections {
		if c.pairingID == s.PairingID {
			delete(e.connections, k)
			c.revoked = true
			if c.outstanding == 0 {
				close = append(close, c.session)
			}
		}
	}
	e.mu.Unlock()
	for _, c := range close {
		c.Close()
	}
}
func (e *Engine) ServeAuthenticated(w http.ResponseWriter, r *http.Request, s pairing.Session) {
	if e.queueRoutes(w, r, s) {
		return
	}
	if e.environmentPreview(w, r, s) {
		return
	}
	p := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if r.Method == "POST" && r.URL.Path == "/v1/connections" {
		var in agentwire.AgentConnectInput
		if !localapi.Decode(w, r, &in) {
			return
		}
		state, err := e.Connect(r.Context(), s, in)
		respond(w, state, err, 201)
		return
	}
	if r.Method == "POST" && r.URL.Path == "/v1/runs" {
		var in agentwire.AgentRunInput
		if !localapi.Decode(w, r, &in) {
			return
		}
		state, err := e.Run(r.Context(), s, in)
		respond(w, state, err, 202)
		return
	}
	if len(p) == 3 && p[1] == "runs" && r.Method == "GET" {
		rid := p[2]
		state, err := e.RunState(s, rid)
		if err == nil {
			_, err = e.privateAuthority(r.Context(), s, state.ProjectID, state.ConnectionID)
		}
		respond(w, state, err, 200)
		return
	}
	if len(p) == 4 && p[1] == "runs" && p[3] == "cancel" && r.Method == "POST" {
		state, err := e.RunState(s, p[2])
		if err == nil {
			_, err = e.privateAuthority(r.Context(), s, state.ProjectID, state.ConnectionID)
		}
		if err == nil {
			err = e.Cancel(s, p[2])
		}
		if err == nil {
			state, err = e.RunState(s, p[2])
		}
		respond(w, state, err, 200)
		return
	}
	if len(p) >= 3 && p[1] == "connections" {
		pid := r.URL.Query().Get("projectId")
		e.mu.Lock()
		c := e.connections[key(s.UserID, pid, p[2])]
		if c != nil && c.pairingID != s.PairingID {
			c = nil
		}
		e.mu.Unlock()
		if c == nil {
			localapi.Fail(w, 404, "not_found")
			return
		}
		_, err := e.config.Platform.Authorize(r.Context(), s.Grant, platformclient.ConnectionRequest{ProjectID: pid, ConnectionID: p[2], Version: c.config.Version, EnvironmentID: c.config.EnvironmentID}, "")
		if err != nil {
			respond(w, nil, err, 200)
			return
		}
		if len(p) == 4 && p[3] == "tools" && r.Method == "GET" {
			tools := []*sdk.Tool{}
			for _, tool := range c.tools {
				tools = append(tools, tool)
			}
			respond(w, agentwire.AgentTools{ToolsJSON: encode(safeCatalog(tools, c.secrets))}, nil, 200)
			return
		}
		if len(p) == 3 && r.Method == "DELETE" {
			e.mu.Lock()
			delete(e.connections, key(s.UserID, pid, p[2]))
			e.mu.Unlock()
			c.session.Close()
			respond(w, agentwire.AgentAccepted{Ok: true}, nil, 200)
			return
		}
	}
	if e.credentials(w, r, s) {
		return
	}
	if e.config.Extra != nil && e.config.Extra(w, r, s) {
		return
	}
	localapi.Fail(w, 404, "not_found")
}
func respond(w http.ResponseWriter, value any, err error, status int) {
	if err != nil {
		localapi.Fail(w, 409, err.Error())
		return
	}
	localapi.JSON(w, status, value)
}

// Close waits for issued runs to freeze their terminal state before encrypted stores close.
func (e *Engine) Close() {
	e.stop()
	e.mu.Lock()
	close := []*mcpclient.Session{}
	for _, c := range e.connections {
		close = append(close, c.session)
	}
	e.mu.Unlock()
	for _, c := range close {
		c.Close()
	}
	e.workers.Wait()
}

func (e *Engine) now() time.Time {
	if e.config.Now != nil {
		return e.config.Now()
	}
	return time.Now()
}
