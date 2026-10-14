// Package platformclient checks live platform identity and actual object authority.
package platformclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/wire"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type ConnectionRequest struct {
	ProjectID     string `json:"projectId"`
	ConnectionID  string `json:"connectionId"`
	Version       int    `json:"version"`
	EnvironmentID string `json:"environmentId"`
}
type Authorized struct {
	Connection wire.Connection
	Variables  []wire.Variable
	Policy     wire.RecordRedactionPolicy
	Capacity   wire.RecordCapacity
}
type Client struct {
	Origin, BaseURL string
	HTTP            *http.Client
}

func New(origin string, client *http.Client) (*Client, error) {
	u, err := url.Parse(origin)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.User != nil || u.Fragment != "" {
		return nil, errors.New("https_origin_required")
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	copy := *client
	copy.Jar = nil
	copy.CheckRedirect = func(*http.Request, []*http.Request) error { return errors.New("platform_redirect_rejected") }
	return &Client{origin, origin, &copy}, nil
}
func (c *Client) request(ctx context.Context, method, path, token string, body, out any) error {
	var data []byte
	var err error
	if body != nil {
		data, err = json.Marshal(body)
		if err != nil {
			return errors.New("invalid_platform_request")
		}
	}
	r, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, bytes.NewReader(data))
	if err != nil {
		return errors.New("platform_unavailable")
	}
	r.Header.Set("Origin", c.Origin)
	r.Header.Set("Authorization", "Bearer "+token)
	if body != nil {
		r.Header.Set("Content-Type", "application/json")
	}
	response, err := c.HTTP.Do(r)
	if err != nil {
		return errors.New("platform_unavailable")
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		if response.StatusCode == 401 {
			return errors.New("platform_identity_expired")
		}
		if response.StatusCode == 403 {
			// Backup password reauthentication is independent of project access.
			// Preserve only that known error on its exact mutation routes; never
			// expose arbitrary platform error bodies or reclassify grant denial.
			if backupReauthenticationRequest(method, path) {
				b, err := io.ReadAll(io.LimitReader(response.Body, 4097))
				var rejection wire.Error
				if err == nil && len(b) <= 4096 && json.Unmarshal(b, &rejection) == nil && rejection.Error.Code == "reauthentication_failed" {
					return errors.New("reauthentication_failed")
				}
			}
			return errors.New("project_permission_revoked")
		}
		return fmt.Errorf("platform_rejected_%d", response.StatusCode)
	}
	b, err := io.ReadAll(io.LimitReader(response.Body, (12<<20)+1))
	if err != nil || len(b) > 12<<20 {
		return errors.New("platform_response_limit")
	}
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if json.Unmarshal(b, &envelope) != nil || len(envelope.Data) == 0 {
		return errors.New("invalid_platform_response")
	}
	if out != nil && json.Unmarshal(envelope.Data, out) != nil {
		return errors.New("invalid_platform_response")
	}
	return nil
}

func backupReauthenticationRequest(method, path string) bool {
	if method != http.MethodPost {
		return false
	}
	parts := strings.Split(path, "/")
	if len(parts) != 8 && len(parts) != 10 {
		return false
	}
	if parts[0] != "" || parts[1] != "api" || parts[2] != "v1" || parts[3] != "projects" || !validID(parts[4]) || parts[5] != "connections" || !validID(parts[6]) || parts[7] != "credential-backups" {
		return false
	}
	return len(parts) == 8 || validID(parts[8]) && parts[9] == "restore"
}
func (c *Client) Exchange(ctx context.Context, proof, device string) (pairing.Grant, error) {
	var v wire.AgentGrant
	err := c.request(ctx, "POST", "/api/v1/agent/exchange", proof, wire.AgentProofRequest{DeviceID: device}, &v)
	expires, e := time.Parse(time.RFC3339, v.ExpiresAt)
	if err != nil {
		return pairing.Grant{}, err
	}
	if e != nil || v.UserID == "" || v.Token == "" || v.DeviceID != device || v.Origin != c.Origin || !time.Now().Before(expires) {
		return pairing.Grant{}, errors.New("grant_binding_mismatch")
	}
	return pairing.Grant{Token: v.Token, UserID: v.UserID, DeviceID: device, Origin: c.Origin, ExpiresAt: expires}, nil
}
func (c *Client) Validate(ctx context.Context, g pairing.Grant) error {
	var v wire.AgentSession
	if err := c.request(ctx, "GET", "/api/v1/agent/session", g.Token, nil, &v); err != nil {
		return err
	}
	expires, err := time.Parse(time.RFC3339, v.ExpiresAt)
	if err != nil || v.UserID != g.UserID || v.DeviceID != g.DeviceID || v.Origin != g.Origin || v.Origin != c.Origin || !time.Now().Before(expires) {
		return errors.New("grant_binding_mismatch")
	}
	return nil
}
func validID(s string) bool {
	return s != "" && len(s) <= 128 && !strings.ContainsAny(s, "/\\?#%\x00\r\n")
}
func (c *Client) Authorize(ctx context.Context, g pairing.Grant, in ConnectionRequest, purpose string) (Authorized, error) {
	var a Authorized
	if !validID(in.ProjectID) || !validID(in.ConnectionID) || in.Version < 1 || in.EnvironmentID != "" && !validID(in.EnvironmentID) {
		return a, errors.New("invalid_identity")
	}
	if err := c.Validate(ctx, g); err != nil {
		return a, err
	}
	base := "/api/v1/projects/" + in.ProjectID
	for _, read := range []struct {
		path string
		out  any
	}{{base + "/connections/" + in.ConnectionID, &a.Connection}, {base + "/variables", &a.Variables}, {base + "/record-redaction-policy", &a.Policy}, {base + "/record-capacity", &a.Capacity}} {
		if err := c.request(ctx, "GET", read.path, g.Token, nil, read.out); err != nil {
			return a, err
		}
	}
	var envs []wire.Environment
	if err := c.request(ctx, "GET", base+"/environments", g.Token, nil, &envs); err != nil {
		return a, err
	}
	found := in.EnvironmentID == ""
	for _, e := range envs {
		if e.ID == in.EnvironmentID && e.ProjectID == in.ProjectID {
			found = true
		}
	}
	if !found || a.Connection.ID != in.ConnectionID || a.Connection.ProjectID != in.ProjectID || a.Connection.Version != in.Version || a.Policy.ProjectID != in.ProjectID || a.Capacity.ProjectID != in.ProjectID {
		return a, errors.New("configuration_binding_mismatch")
	}
	var access wire.ConnectionAccess
	if err := c.request(ctx, "POST", base+"/connections/"+in.ConnectionID+"/session-access", g.Token, wire.ConnectionAccessRequest{Version: in.Version, EnvironmentID: in.EnvironmentID, Purpose: purpose}, &access); err != nil {
		return a, err
	}
	if access.UserID != g.UserID || access.ProjectID != in.ProjectID || access.ConnectionID != in.ConnectionID || access.Version != in.Version || access.EnvironmentID != in.EnvironmentID {
		return a, errors.New("authority_binding_mismatch")
	}
	a.Connection.EnvironmentID = in.EnvironmentID
	return a, nil
}
func (c *Client) Upload(ctx context.Context, g pairing.Grant, in wire.RecordUploadInput) (wire.RecordOperationReceipt, error) {
	var receipt wire.RecordOperationReceipt
	if err := c.Validate(ctx, g); err != nil {
		return receipt, err
	}
	err := c.request(ctx, "POST", "/api/v1/projects/"+in.ProjectID+"/record-uploads", g.Token, in, &receipt)
	return receipt, err
}
func (c *Client) Forward(ctx context.Context, g pairing.Grant, method, path string, body, out any) error {
	if err := c.Validate(ctx, g); err != nil {
		return err
	}
	return c.request(ctx, method, path, g.Token, body, out)
}

// Current checks the actual object and resolves its current version for private credential operations.
func (c *Client) Current(ctx context.Context, g pairing.Grant, pid, cid string) (Authorized, error) {
	if !validID(pid) || !validID(cid) {
		return Authorized{}, errors.New("invalid_identity")
	}
	if err := c.Validate(ctx, g); err != nil {
		return Authorized{}, err
	}
	var connection wire.Connection
	if err := c.request(ctx, "GET", "/api/v1/projects/"+pid+"/connections/"+cid, g.Token, nil, &connection); err != nil {
		return Authorized{}, err
	}
	return c.Authorize(ctx, g, ConnectionRequest{ProjectID: pid, ConnectionID: cid, Version: connection.Version, EnvironmentID: connection.EnvironmentID}, "")
}
func (c *Client) Project(ctx context.Context, g pairing.Grant, pid string) error {
	if !validID(pid) {
		return errors.New("invalid_identity")
	}
	if err := c.Validate(ctx, g); err != nil {
		return err
	}
	var connections []wire.Connection
	return c.request(ctx, "GET", "/api/v1/projects/"+pid+"/connections", g.Token, nil, &connections)
}

// NewInsecureLoopback is only for an explicit local development Origin.
func NewInsecureLoopback(origin string, client *http.Client) (*Client, error) {
	u, e := url.Parse(origin)
	if e != nil || u.Scheme != "http" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("loopback_origin_required")
	}
	c, e := New("https://"+u.Host, client)
	if e != nil {
		return nil, e
	}
	c.Origin = origin
	c.BaseURL = origin
	return c, nil
}
