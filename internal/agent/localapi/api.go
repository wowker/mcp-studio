// Package localapi exposes a protected literal-loopback browser channel. Local approval has no HTTP route.
package localapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/recording"
	"mime"
	"net"
	"net/http"
	"net/url"
	"reflect"
	"strings"
	"time"
)

type Platform interface {
	Exchange(context.Context, string, string) (pairing.Grant, error)
	Validate(context.Context, pairing.Grant) error
}
type Engine interface {
	ServeAuthenticated(http.ResponseWriter, *http.Request, pairing.Session)
	Unpair(pairing.Session)
}
type Config struct {
	QueueMode              func(string) string
	IsVaultAvailable       func() bool
	Origin, Host, DeviceID string
	AllowInsecureLoopback  bool
	Platform               Platform
	Confirm                pairing.ConfirmLocal
	Engine                 Engine
	VaultAvailable         bool
	QueueRetention         string
}
type API struct {
	config  Config
	manager *pairing.Manager
}

var Capabilities = []string{"agent-http", "stdio", "credentials", "encrypted-queue", "oauth"}

func New(c Config) (*API, error) {
	u, err := url.Parse(c.Origin)
	if err != nil || u.Host == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && !(c.AllowInsecureLoopback && u.Scheme == "http" && (u.Hostname() == "127.0.0.1" || u.Hostname() == "localhost"))) {
		return nil, errors.New("invalid_platform_origin")
	}
	host, port, err := net.SplitHostPort(c.Host)
	if err != nil || host != "127.0.0.1" || port == "" || c.DeviceID == "" || c.Platform == nil {
		return nil, errors.New("literal_loopback_required")
	}
	if c.QueueRetention == "" {
		c.QueueRetention = "encrypted"
	}
	return &API{c, pairing.New(nil)}, nil
}
func Listen(host string) (net.Listener, error) {
	h, _, err := net.SplitHostPort(host)
	if err != nil || h != "127.0.0.1" {
		return nil, errors.New("literal_loopback_required")
	}
	return net.Listen("tcp4", host)
}
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"data": v})
}
func Fail(w http.ResponseWriter, status int, code string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]any{"error": map[string]string{"code": code}})
}
func Decode(w http.ResponseWriter, r *http.Request, out any) bool {
	kind, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || kind != "application/json" {
		Fail(w, 415, "json_required")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, (1<<20)+16384)
	b, err := io.ReadAll(r.Body)
	if err != nil {
		Fail(w, 413, "body_limit")
		return false
	}
	parsed, parseErr := recording.Parse(string(b), false)
	if parseErr != nil {
		Fail(w, 400, "invalid_json")
		return false
	}
	object, ok := parsed.(map[string]any)
	if !ok {
		Fail(w, 400, "invalid_input")
		return false
	}
	valueType := reflect.TypeOf(out)
	if valueType.Kind() == reflect.Pointer {
		valueType = valueType.Elem()
	}
	if valueType.Kind() == reflect.Struct {
		for i := 0; i < valueType.NumField(); i++ {
			field := valueType.Field(i)
			tag := field.Tag.Get("json")
			name := strings.Split(tag, ",")[0]
			if name != "" && name != "-" && !strings.Contains(tag, "omitempty") {
				if _, present := object[name]; !present {
					Fail(w, 400, "required_field_missing")
					return false
				}
			}
		}
	}
	d := json.NewDecoder(strings.NewReader(string(b)))
	d.DisallowUnknownFields()
	if d.Decode(out) != nil {
		Fail(w, 400, "invalid_input")
		return false
	}
	return true
}
func (a *API) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Host != a.config.Host || r.Header.Get("Origin") != a.config.Origin || r.Header.Get("Cookie") != "" || r.Header.Get("Forwarded") != "" || r.Header.Get("X-Forwarded-Host") != "" || r.Header.Get("X-Forwarded-Proto") != "" || r.URL.User != nil {
		Fail(w, 403, "source_rejected")
		return
	}
	for key := range r.URL.Query() {
		if recording.SensitiveName(key) {
			Fail(w, 400, "secret_in_url")
			return
		}
	}
	for name := range r.Header {
		if strings.HasPrefix(strings.ToLower(name), "x-forwarded-") {
			Fail(w, 403, "source_rejected")
			return
		}
	}
	w.Header().Set("Access-Control-Allow-Origin", a.config.Origin)
	w.Header().Set("Vary", "Origin")
	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.WriteHeader(204)
		return
	}
	if r.Method == "GET" && r.URL.Path == "/v1/status" {
		state := "unpaired"
		uid := ""
		if strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
			session, err := a.manager.Authenticate(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "), a.config.Origin, a.config.DeviceID)
			if err == nil && a.config.Platform.Validate(r.Context(), session.Grant) == nil {
				state = "online"
				uid = session.UserID
			}
		}
		mode := a.config.QueueRetention
		if uid != "" && a.config.QueueMode != nil {
			mode = a.config.QueueMode(uid)
		}
		available := a.config.VaultAvailable
		if a.config.IsVaultAvailable != nil {
			available = a.config.IsVaultAvailable()
		}
		JSON(w, 200, map[string]any{"contractVersion": "1.0.0", "deviceId": a.config.DeviceID, "state": state, "capabilities": Capabilities, "vaultAvailable": available, "queueRetention": mode})
		return
	}
	if r.Method == "POST" && r.URL.Path == "/v1/pairing/challenges" {
		var input struct {
			PlatformProof   string `json:"platformProof"`
			DeviceID        string `json:"deviceId"`
			ContractVersion string `json:"contractVersion"`
		}
		if !Decode(w, r, &input) {
			return
		}
		if input.ContractVersion != "1.0.0" || input.DeviceID != a.config.DeviceID || input.PlatformProof == "" {
			Fail(w, 400, "incompatible_or_binding")
			return
		}
		grant, err := a.config.Platform.Exchange(r.Context(), input.PlatformProof, input.DeviceID)
		if err != nil || grant.Origin != a.config.Origin || grant.DeviceID != input.DeviceID {
			Fail(w, 401, "platform_identity_rejected")
			return
		}
		challenge, _, err := a.manager.Challenge(grant, Capabilities)
		if err != nil {
			Fail(w, 409, "pairing_rejected")
			return
		}
		if a.config.Confirm != nil {
			go a.manager.Approve(context.Background(), challenge.ChallengeID, a.config.Confirm)
		}
		JSON(w, 201, challenge)
		return
	}
	if r.Method == "POST" && r.URL.Path == "/v1/pairing/confirmations" {
		var input struct {
			ChallengeID string `json:"challengeId"`
			Code        string `json:"code"`
		}
		if !Decode(w, r, &input) {
			return
		}
		session, err := a.manager.Confirm(input.ChallengeID, input.Code, a.config.Origin, a.config.DeviceID)
		if err != nil {
			Fail(w, 403, "pairing_rejected")
			return
		}
		if err = a.config.Platform.Validate(r.Context(), session.Grant); err != nil {
			a.manager.Revoke(session.ChannelToken, session.PairingID)
			Fail(w, 401, "platform_identity_rejected")
			return
		}
		JSON(w, 201, session)
		return
	}
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		Fail(w, 401, "channel_required")
		return
	}
	session, err := a.manager.Authenticate(strings.TrimPrefix(auth, "Bearer "), a.config.Origin, a.config.DeviceID)
	if err != nil {
		Fail(w, 401, "channel_expired")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()
	if err = a.config.Platform.Validate(ctx, session.Grant); err != nil {
		Fail(w, 401, "platform_identity_rejected")
		return
	}
	if r.Method == "DELETE" && r.URL.Path == "/v1/pairing/"+session.PairingID {
		a.manager.Revoke(session.ChannelToken, session.PairingID)
		if a.config.Engine != nil {
			a.config.Engine.Unpair(session)
		}
		JSON(w, 200, map[string]bool{"ok": true})
		return
	}
	if a.config.Engine == nil {
		Fail(w, 503, "agent_runtime_unavailable")
		return
	}
	a.config.Engine.ServeAuthenticated(w, r, session)
}
