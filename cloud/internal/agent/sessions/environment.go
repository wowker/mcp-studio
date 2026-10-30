package sessions

import (
	"context"
	"encoding/json"
	"errors"
	"mcp-studio/internal/agent/localapi"
	"mcp-studio/internal/agent/pairing"
	"mcp-studio/internal/agent/platformclient"
	"mcp-studio/internal/agent/vault"
	agentwire "mcp-studio/internal/agent/wire"
	"mcp-studio/internal/environment"
	"mcp-studio/internal/recording"
	"net/http"
	"strings"
)

type previewRow struct {
	Name         string  `json:"name"`
	DefinitionID string  `json:"definitionId"`
	Type         string  `json:"type"`
	Sensitive    bool    `json:"sensitive"`
	Required     bool    `json:"required"`
	Source       *string `json:"source"`
	Status       string  `json:"status"`
	ValueJSON    string  `json:"valueJSON"`
}

func (e *Engine) environmentPreview(w http.ResponseWriter, r *http.Request, s pairing.Session) bool {
	if r.Method != "POST" || r.URL.Path != "/v1/environment/preview" {
		return false
	}
	var in agentwire.AgentConnectInput
	if !localapi.Decode(w, r, &in) {
		return true
	}
	a, err := e.config.Platform.Authorize(r.Context(), s.Grant, request(in), "")
	if err != nil {
		respond(w, nil, err, 200)
		return true
	}
	personal, secrets, err := e.personalValues(r.Context(), s.Grant, a)
	if err != nil {
		respond(w, map[string]any{"projectId": in.ProjectID, "connectionId": in.ConnectionID, "environmentId": in.EnvironmentID, "valid": false, "diagnostic": "credential_unavailable", "previewJSON": `{"rows":[],"error":"credential_unavailable"}`}, nil, 200)
		return true
	}
	layers := environment.BuildLayers(a.Variables, in.ProjectID, in.ConnectionID, in.EnvironmentID)
	resolved := environment.Resolve(environment.Input{Layers: layers, Personal: personal})
	effective := map[string]environment.Definition{}
	for _, layer := range layers {
		for _, def := range layer.Definitions {
			effective[def.Name] = def
		}
	}
	rows := []previewRow{}
	valid := resolved.Error == ""
	diagnostic := resolved.Error
	for _, row := range resolved.Rows {
		definition := effective[row.Name]
		metadata := row.Name + "\x00" + definition.ID + "\x00" + definition.Type
		if row.Source != nil {
			metadata += "\x00" + *row.Source
		}
		for _, secret := range secrets {
			if secret != "" && strings.Contains(metadata, secret) {
				valid = false
				diagnostic = "metadata_redacted"
				rows = []previewRow{}
				break
			}
		}
		if diagnostic == "metadata_redacted" {
			break
		}
		valueJSON := ""
		if row.Status == "resolved" && !row.Sensitive {
			safe, err := recording.Redact(row.Value, recording.Options{SecretValues: secrets})
			if err == nil {
				valueJSON = encode(safe.Value)
			}
		}
		if row.Status != "resolved" {
			valid = false
			if diagnostic == "" {
				diagnostic = row.Status
			}
		}
		rows = append(rows, previewRow{row.Name, definition.ID, definition.Type, row.Sensitive, definition.Required, row.Source, row.Status, valueJSON})
	}
	respond(w, map[string]any{"projectId": in.ProjectID, "connectionId": in.ConnectionID, "environmentId": in.EnvironmentID, "valid": valid, "diagnostic": diagnostic, "previewJSON": encode(map[string]any{"rows": rows, "error": resolved.Error})}, nil, 200)
	return true
}
func (e *Engine) personalValues(ctx context.Context, g pairing.Grant, a platformclient.Authorized) (map[string]any, []string, error) {
	personal := map[string]any{}
	secrets := []string{}
	if e.config.Vault == nil {
		return personal, secrets, nil
	}
	for _, v := range effectiveDefinitions(a) {
		if !v.Sensitive {
			continue
		}
		value, err := e.config.Vault.Get(ctx, vault.Scope{UserID: g.UserID, ProjectID: a.Connection.ProjectID, ConnectionID: a.Connection.ID, Kind: "variable", ReferenceID: v.ID})
		if errors.Is(err, vault.ErrMissing) || errors.Is(err, vault.ErrExpired) {
			continue
		}
		if err != nil {
			return nil, nil, err
		}
		decoded, err := recording.Parse(value.ValueJSON, false)
		if err != nil {
			return nil, nil, errors.New("credential_corrupt")
		}
		var typed any
		if json.Unmarshal([]byte(encode(decoded)), &typed) != nil {
			return nil, nil, errors.New("credential_corrupt")
		}
		personal[v.ID] = typed
		secrets = append(secrets, recording.StringLeaves(typed)...)
	}
	return personal, secrets, nil
}

func effectiveDefinitions(a platformclient.Authorized) map[string]environment.Definition {
	effective := map[string]environment.Definition{}
	for _, layer := range environment.BuildLayers(a.Variables, a.Connection.ProjectID, a.Connection.ID, a.Connection.EnvironmentID) {
		for _, def := range layer.Definitions {
			effective[def.Name] = def
		}
	}
	return effective
}
