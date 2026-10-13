package sessions

import (
	"context"
	"encoding/json"
	"errors"
	"mcp-studio/internal/agent/localapi"
	"mcp-studio/internal/agent/oauth"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/vault"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/wire"
	"net/http"
	"strings"
	"time"
)

type currentAuthority interface {
	Current(context.Context, pairing.Grant, string, string) (platformclient.Authorized, error)
}
type forwarder interface {
	Forward(context.Context, pairing.Grant, string, string, any, any) error
}
type storeValues struct{ store *vault.Store }

func (v storeValues) Resolve(ctx context.Context, g pairing.Grant, a platformclient.Authorized) (map[string]any, string, []string, error) {
	personal := map[string]any{}
	secretValues := []string{}
	for _, def := range effectiveDefinitions(a) {
		if !def.Sensitive {
			continue
		}
		value, err := v.store.Get(ctx, vault.Scope{UserID: g.UserID, ProjectID: a.Connection.ProjectID, ConnectionID: a.Connection.ID, Kind: "variable", ReferenceID: def.ID})
		if errors.Is(err, vault.ErrMissing) {
			continue
		}
		if err != nil {
			return nil, "", nil, err
		}
		var decoded any
		if json.Unmarshal([]byte(value.ValueJSON), &decoded) != nil {
			return nil, "", nil, errors.New("credential_corrupt")
		}
		personal[def.ID] = decoded
		secretValues = append(secretValues, recording.StringLeaves(decoded)...)
	}
	bearer := ""
	if a.Connection.AuthMode == "token" || a.Connection.AuthMode == "oauth" {
		value, err := v.store.Get(ctx, vault.Scope{UserID: g.UserID, ProjectID: a.Connection.ProjectID, ConnectionID: a.Connection.ID, Kind: a.Connection.AuthMode})
		if err != nil {
			return nil, "", nil, err
		}
		if a.Connection.AuthMode == "token" {
			if json.Unmarshal([]byte(value.ValueJSON), &bearer) != nil {
				return nil, "", nil, errors.New("credential_invalid")
			}
		} else {
			var token oauth.Token
			if json.Unmarshal([]byte(value.ValueJSON), &token) != nil || token.Resource != a.Connection.Endpoint {
				return nil, "", nil, errors.New("oauth_resource_binding")
			}
			expiry, err := time.Parse(time.RFC3339, token.ExpiresAt)
			if err != nil || !time.Now().Before(expiry) {
				return nil, "", nil, errors.New("oauth_expired")
			}
			for _, scope := range a.Connection.OauthScopes {
				found := false
				for _, granted := range token.Scopes {
					if scope == granted {
						found = true
					}
				}
				if !found {
					return nil, "", nil, errors.New("oauth_scope_mismatch")
				}
			}
			bearer = token.AccessToken
		}
		secretValues = append(secretValues, bearer)
	}
	return personal, bearer, secretValues, nil
}
func (e *Engine) privateAuthority(ctx context.Context, s pairing.Session, pid, cid string) (platformclient.Authorized, error) {
	p, ok := e.config.Platform.(currentAuthority)
	if !ok {
		return platformclient.Authorized{}, errors.New("authority_unavailable")
	}
	return p.Current(ctx, s.Grant, pid, cid)
}
func (e *Engine) scope(ctx context.Context, s pairing.Session, pid, cid, kind, reference string) (vault.Scope, error) {
	a, err := e.privateAuthority(ctx, s, pid, cid)
	if err != nil {
		return vault.Scope{}, err
	}
	scope := vault.Scope{UserID: s.UserID, ProjectID: pid, ConnectionID: cid, Kind: kind, ReferenceID: reference}
	if !vault.ValidID(pid) || !vault.ValidID(cid) || kind != "token" && kind != "oauth" && kind != "variable" || kind != "variable" && reference != "" {
		return scope, errors.New("invalid_credential_scope")
	}
	if kind == "variable" {
		exists := false
		for _, v := range a.Variables {
			if v.ID == reference && v.Sensitive && v.ProjectID == pid && (v.ConnectionID == "" || v.ConnectionID == cid) {
				exists = true
			}
		}
		if !exists {
			return scope, errors.New("variable_definition_missing")
		}
	}
	return scope, nil
}
func (e *Engine) credentials(w http.ResponseWriter, r *http.Request, s pairing.Session) bool {
	if !strings.HasPrefix(r.URL.Path, "/v1/credentials") && !strings.HasPrefix(r.URL.Path, "/v1/oauth") {
		return false
	}
	if e.config.Vault == nil {
		localapi.Fail(w, 503, "vault_unavailable")
		return true
	}
	allowed := map[string]string{"/v1/credentials": "POST DELETE", "/v1/credentials/status": "POST", "/v1/credentials/reveal": "POST", "/v1/oauth": "POST", "/v1/credentials/backups": "GET", "/v1/credentials/backup": "POST DELETE", "/v1/credentials/restore": "POST"}
	methods, known := allowed[r.URL.Path]
	if !known && strings.HasPrefix(r.URL.Path, "/v1/oauth/") {
		if strings.HasSuffix(r.URL.Path, "/save") {
			methods = "POST"
		} else {
			methods = "GET"
		}
		known = true
	}
	if known && !strings.Contains(" "+methods+" ", " "+r.Method+" ") {
		localapi.Fail(w, 405, "method_not_allowed")
		return true
	}
	switch r.URL.Path {
	case "/v1/credentials":
		if r.Method == "POST" {
			var in agentwire.AgentCredentialInput
			if !localapi.Decode(w, r, &in) {
				return true
			}
			scope, err := e.scope(r.Context(), s, in.ProjectID, in.ConnectionID, in.Kind, in.ReferenceID)
			if err == nil {
				if in.Kind == "oauth" {
					err = errors.New("oauth_flow_required")
				} else {
					if in.Kind == "token" {
						var token string
						if json.Unmarshal([]byte(in.ValueJSON), &token) != nil || strings.TrimSpace(token) == "" || len(token) > 32768 || strings.ContainsAny(token, "\x00\r\n") {
							err = errors.New("invalid_token_credential")
						}
					}
					if err == nil {
						err = e.config.Vault.Save(r.Context(), scope, vault.Value{ValueJSON: in.ValueJSON}, in.Retention)
					}
				}
			}
			state := e.credentialStatus(r.Context(), scope)
			respond(w, state, err, 200)
			return true
		}
		if r.Method == "DELETE" {
			var in agentwire.AgentCredentialScope
			if !localapi.Decode(w, r, &in) {
				return true
			}
			scope, err := e.scope(r.Context(), s, in.ProjectID, in.ConnectionID, in.Kind, in.ReferenceID)
			if err == nil {
				err = e.config.Vault.Delete(r.Context(), scope)
			}
			respond(w, agentwire.AgentAccepted{Ok: err == nil}, err, 200)
			return true
		}
	case "/v1/credentials/status":
		var in agentwire.AgentCredentialScope
		if !localapi.Decode(w, r, &in) {
			return true
		}
		scope, err := e.scope(r.Context(), s, in.ProjectID, in.ConnectionID, in.Kind, in.ReferenceID)
		if err != nil {
			respond(w, nil, err, 200)
			return true
		}
		respond(w, e.credentialStatus(r.Context(), scope), nil, 200)
		return true
	case "/v1/credentials/reveal":
		var in agentwire.AgentCredentialRevealInput
		if !localapi.Decode(w, r, &in) {
			return true
		}
		scope, err := e.scope(r.Context(), s, in.ProjectID, in.ConnectionID, in.Kind, in.ReferenceID)
		var value vault.Value
		if err == nil && !in.Confirmed {
			err = errors.New("explicit_reveal_required")
		}
		if err == nil {
			value, err = e.config.Vault.Get(r.Context(), scope)
		}
		respond(w, agentwire.AgentSecret{ValueJSON: value.ValueJSON}, err, 200)
		return true
	case "/v1/oauth":
		var in agentwire.AgentOAuthInput
		if !localapi.Decode(w, r, &in) {
			return true
		}
		a, err := e.config.Platform.Authorize(r.Context(), s.Grant, platformclient.ConnectionRequest{ProjectID: in.ProjectID, ConnectionID: in.ConnectionID, Version: in.Version, EnvironmentID: in.EnvironmentID}, "")
		var start oauth.Start
		if err == nil {
			if a.Connection.AuthMode != "oauth" || a.Connection.Channel != "agent" {
				err = errors.New("oauth_configuration_invalid")
			} else {
				start, err = e.config.OAuth.Start(r.Context(), oauth.Binding{UserID: s.UserID, ProjectID: in.ProjectID, ConnectionID: in.ConnectionID}, a.Connection.Endpoint, a.Connection.OauthClientID, a.Connection.OauthScopes)
			}
		}
		if err == nil {
			e.mu.Lock()
			e.oauthBindings[start.AttemptID] = oauth.Binding{UserID: s.UserID, ProjectID: in.ProjectID, ConnectionID: in.ConnectionID}
			e.mu.Unlock()
		}
		respond(w, agentwire.AgentOAuthStart{AttemptID: start.AttemptID, AuthorizationUrl: start.AuthorizationURL, ExpiresAt: start.ExpiresAt.UTC().Format(time.RFC3339)}, err, 201)
		return true
	case "/v1/credentials/backups", "/v1/credentials/backup", "/v1/credentials/restore":
		return e.backups(w, r, s)
	}
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) >= 3 && parts[1] == "oauth" {
		id := parts[2]
		e.mu.Lock()
		binding, ok := e.oauthBindings[id]
		e.mu.Unlock()
		if !ok || binding.UserID != s.UserID {
			localapi.Fail(w, 404, "not_found")
			return true
		}
		_, err := e.privateAuthority(r.Context(), s, binding.ProjectID, binding.ConnectionID)
		if err != nil {
			respond(w, nil, err, 200)
			return true
		}
		if len(parts) == 3 && r.Method == "GET" {
			state, err := e.config.OAuth.State(id, binding)
			respond(w, agentwire.AgentOAuthState{AttemptID: id, Status: state.Status, Saved: state.Saved, Diagnostic: state.Diagnostic}, err, 200)
			return true
		}
		if len(parts) == 4 && parts[3] == "save" && r.Method == "POST" {
			var in agentwire.AgentOAuthSaveInput
			if !localapi.Decode(w, r, &in) {
				return true
			}
			err := e.config.OAuth.Save(r.Context(), id, binding, func(token oauth.Token) error {
				return e.config.Vault.Save(r.Context(), vault.Scope{UserID: s.UserID, ProjectID: binding.ProjectID, ConnectionID: binding.ConnectionID, Kind: "oauth"}, vault.Value{ValueJSON: encode(token), ExpiresAt: token.ExpiresAt}, in.Retention)
			})
			scope := vault.Scope{UserID: s.UserID, ProjectID: binding.ProjectID, ConnectionID: binding.ConnectionID, Kind: "oauth"}
			respond(w, e.credentialStatus(r.Context(), scope), err, 200)
			return true
		}
	}
	localapi.Fail(w, 404, "not_found")
	return true
}
func (e *Engine) credentialStatus(ctx context.Context, scope vault.Scope) agentwire.AgentCredentialState {
	state := agentwire.AgentCredentialState{ProjectID: scope.ProjectID, ConnectionID: scope.ConnectionID, Kind: scope.Kind, ReferenceID: scope.ReferenceID, Location: "none", Status: "missing"}
	location, present, err := e.config.Vault.Status(ctx, scope)
	state.Location = location
	state.Present = present
	if present {
		state.Status = "saved"
		value, _ := e.config.Vault.Get(ctx, scope)
		state.ExpiresAt = value.ExpiresAt
	}
	if err != nil {
		state.Status = "failed"
		state.Diagnostic = err.Error()
		if errors.Is(err, vault.ErrExpired) {
			state.Status = "expired"
		}
	}
	return state
}
func (e *Engine) backups(w http.ResponseWriter, r *http.Request, s pairing.Session) bool {
	forward, ok := e.config.Platform.(forwarder)
	if !ok {
		localapi.Fail(w, 503, "platform_unavailable")
		return true
	}
	if r.URL.Path == "/v1/credentials/backups" && r.Method == "GET" {
		pid, cid := r.URL.Query().Get("projectId"), r.URL.Query().Get("connectionId")
		_, err := e.privateAuthority(r.Context(), s, pid, cid)
		var result []wire.CredentialBackup
		if err == nil {
			err = forward.Forward(r.Context(), s.Grant, "GET", backupPath(pid, cid), nil, &result)
		}
		respond(w, agentwire.AgentBackups{BackupsJSON: encode(result)}, err, 200)
		return true
	}
	if r.URL.Path == "/v1/credentials/backup" && r.Method == "POST" {
		var in agentwire.AgentBackupInput
		if !localapi.Decode(w, r, &in) {
			return true
		}
		scope, err := e.scope(r.Context(), s, in.ProjectID, in.ConnectionID, in.Kind, in.ReferenceID)
		var value vault.Value
		if err == nil && !in.Confirmed {
			err = errors.New("backup_confirmation_required")
		}
		if err == nil {
			value, err = e.config.Vault.Get(r.Context(), scope)
		}
		backups := []wire.CredentialBackup{}
		expectedVersion := 0
		if err == nil {
			err = forward.Forward(r.Context(), s.Grant, "GET", backupPath(in.ProjectID, in.ConnectionID), nil, &backups)
		}
		if err == nil {
			for _, backup := range backups {
				if backup.Kind == in.Kind && backup.ReferenceID == in.ReferenceID {
					if expectedVersion != 0 || backup.Version < 1 {
						err = errors.New("invalid_backup_metadata")
						break
					}
					expectedVersion = backup.Version
				}
			}
		}
		if err == nil {
			var result wire.CredentialBackup
			err = forward.Forward(r.Context(), s.Grant, "POST", backupPath(in.ProjectID, in.ConnectionID), wire.CredentialBackupInput{Confirmed: in.Confirmed, Password: in.Password, Kind: in.Kind, ReferenceID: in.ReferenceID, ValueJSON: value.ValueJSON, SourceDigest: hash(value.ValueJSON), ExpectedVersion: expectedVersion}, &result)
			if err == nil {
				if result.Kind != in.Kind || result.ReferenceID != in.ReferenceID || result.Version != expectedVersion+1 {
					err = errors.New("invalid_backup_metadata")
				} else {
					updated := []wire.CredentialBackup{}
					for _, backup := range backups {
						if backup.Kind != in.Kind || backup.ReferenceID != in.ReferenceID {
							updated = append(updated, backup)
						}
					}
					backups = append(updated, result)
				}
			}
		}
		respond(w, agentwire.AgentBackups{BackupsJSON: encode(backups)}, err, 200)
		return true
	}
	if r.URL.Path == "/v1/credentials/backup" && r.Method == "DELETE" {
		var in agentwire.AgentBackupDeleteInput
		if !localapi.Decode(w, r, &in) {
			return true
		}
		_, err := e.privateAuthority(r.Context(), s, in.ProjectID, in.ConnectionID)
		if err == nil && !vault.ValidID(in.BackupID) {
			err = errors.New("invalid_identity")
		}
		if err == nil {
			err = forward.Forward(r.Context(), s.Grant, "DELETE", backupPath(in.ProjectID, in.ConnectionID)+"/"+in.BackupID, nil, &wire.Accepted{})
		}
		respond(w, agentwire.AgentAccepted{Ok: err == nil}, err, 200)
		return true
	}
	if r.URL.Path == "/v1/credentials/restore" && r.Method == "POST" {
		var in agentwire.AgentBackupRestoreInput
		if !localapi.Decode(w, r, &in) {
			return true
		}
		_, err := e.privateAuthority(r.Context(), s, in.ProjectID, in.ConnectionID)
		if err == nil && (!in.Confirmed || !vault.ValidID(in.BackupID)) {
			err = errors.New("backup_confirmation_required")
		}
		var result wire.CredentialBackupSecret
		var restoredScope vault.Scope
		if err == nil {
			err = forward.Forward(r.Context(), s.Grant, "POST", backupPath(in.ProjectID, in.ConnectionID)+"/"+in.BackupID+"/restore", wire.CredentialBackupRestoreInput{Confirmed: in.Confirmed, Password: in.Password}, &result)
		}
		if err == nil {
			scope, scopeErr := e.scope(r.Context(), s, in.ProjectID, in.ConnectionID, result.Kind, result.ReferenceID)
			restoredScope = scope
			if scopeErr != nil {
				err = scopeErr
			} else {
				expiry := ""
				if result.Kind == "oauth" {
					var token oauth.Token
					if json.Unmarshal([]byte(result.ValueJSON), &token) != nil {
						err = errors.New("credential_invalid")
					}
					expiry = token.ExpiresAt
				}
				if err == nil {
					err = e.config.Vault.Save(r.Context(), scope, vault.Value{ValueJSON: result.ValueJSON, ExpiresAt: expiry}, in.Retention)
				}
			}
		}
		respond(w, e.credentialStatus(r.Context(), restoredScope), err, 200)
		return true
	}
	localapi.Fail(w, 404, "not_found")
	return true
}
func backupPath(pid, cid string) string {
	return "/api/v1/projects/" + pid + "/connections/" + cid + "/credential-backups"
}
