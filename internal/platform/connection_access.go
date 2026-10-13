package platform

import (
	"context"
	"mcp-studio/internal/environment"
	"mcp-studio/internal/wire"
	"net/http"
	"net/url"
)

func connectionInput(value wire.Connection) wire.ConnectionInput {
	return wire.ConnectionInput{Name: value.Name, Transport: value.Transport, Channel: value.Channel, Endpoint: value.Endpoint, Command: value.Command, Args: value.Args, Cwd: value.Cwd, Headers: value.Headers, Env: value.Env, TimeoutMs: value.TimeoutMs, EnvironmentID: value.EnvironmentID, AuthMode: value.AuthMode, AuthReferenceID: value.AuthReferenceID, OauthClientID: value.OauthClientID, OauthScopes: value.OauthScopes}
}

func (a *App) authorizeConnection(w http.ResponseWriter, r *http.Request) {
	tx, u, _, ok := a.configurationTx(w, r, false, true)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	cid := r.PathValue("connectionId")
	connection, err := connectionValue(ctx, tx, pid, cid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	var input wire.ConnectionAccessRequest
	if !decode(w, r, &input) {
		return
	}
	if input.Version != connection.Version {
		fail(w, 409, "version_conflict")
		return
	}
	if !configurationReference(ctx, tx, "environments", pid, input.EnvironmentID) || !configurationReference(ctx, tx, "variables", pid, connection.AuthReferenceID) {
		fail(w, 400, "missing_reference")
		return
	}
	// Applying an environment is private session state, not a shared config write.
	connection.EnvironmentID = input.EnvironmentID
	if code := a.validateConnectionReferences(ctx, tx, pid, cid, connectionInput(connection)); code != "" {
		fail(w, 400, code)
		return
	}
	if code := validateConnectionUsedDefinitions(ctx, tx, pid, cid, connectionInput(connection)); code != "" {
		fail(w, 400, code)
		return
	}
	configurationCommit(w, r, tx, wire.ConnectionAccess{UserID: u.ID, ProjectID: pid, ConnectionID: cid, Version: connection.Version, EnvironmentID: connection.EnvironmentID}, "")
}

func connectionEffectiveDefinitions(ctx context.Context, q configurationQuerier, projectID, connectionID, environmentID string) (map[string]environment.Definition, string) {
	variables, err := loadConfigurationVariables(ctx, q, projectID)
	if err != nil {
		return nil, "database_unavailable"
	}
	effective := map[string]environment.Definition{}
	for _, layer := range environment.BuildLayers(variables, projectID, connectionID, environmentID) {
		for _, definition := range layer.Definitions {
			effective[definition.Name] = definition
		}
	}
	return effective, ""
}
func configurationAuthReference(ctx context.Context, q configurationQuerier, projectID, connectionID string, input wire.ConnectionInput) string {
	if input.AuthReferenceID == "" {
		return ""
	}
	effective, code := connectionEffectiveDefinitions(ctx, q, projectID, connectionID, input.EnvironmentID)
	if code != "" {
		return code
	}
	for _, definition := range effective {
		if definition.ID == input.AuthReferenceID && definition.Sensitive && definition.Type == "string" {
			return ""
		}
	}
	return "invalid_auth_reference"
}

// Check definition identity and dependency structure only. Personal values never
// reach the platform; their value/type/required checks run in the browser resolver.
func validateConnectionUsedDefinitions(ctx context.Context, q configurationQuerier, projectID, connectionID string, input wire.ConnectionInput) string {
	effective, code := connectionEffectiveDefinitions(ctx, q, projectID, connectionID, input.EnvironmentID)
	if code != "" {
		return code
	}
	if code = configurationAuthReference(ctx, q, projectID, connectionID, input); code != "" {
		return code
	}
	text, err := url.QueryUnescape(input.Endpoint)
	if err != nil {
		return "invalid_endpoint"
	}
	targets := []any{text, input.Command, input.Cwd}
	for _, arg := range input.Args {
		targets = append(targets, arg)
	}
	for _, entry := range input.Headers {
		targets = append(targets, entry.Value)
	}
	for _, entry := range input.Env {
		targets = append(targets, entry.Value)
	}
	steps := 0
	var references func(any, int) ([]string, string)
	references = func(value any, depth int) ([]string, string) {
		steps++
		if depth > 64 || steps > 4096 {
			return nil, "resolution_limit"
		}
		result := []string{}
		switch value := value.(type) {
		case string:
			for _, match := range environment.Reference.FindAllStringSubmatch(value, -1) {
				result = append(result, match[1])
			}
		case []any:
			for _, child := range value {
				names, code := references(child, depth+1)
				if code != "" {
					return nil, code
				}
				result = append(result, names...)
			}
		case map[string]any:
			for _, child := range value {
				names, code := references(child, depth+1)
				if code != "" {
					return nil, code
				}
				result = append(result, names...)
			}
		}
		return result, ""
	}
	active := map[string]bool{}
	complete := map[string]bool{}
	var visit func(string, int) string
	visit = func(name string, depth int) string {
		steps++
		if depth > 64 || steps > 4096 {
			return "resolution_limit"
		}
		definition, exists := effective[name]
		if !exists {
			return "definition_missing"
		}
		if active[name] {
			return "cycle"
		}
		if complete[name] {
			return ""
		}
		active[name] = true
		if !definition.Sensitive {
			names, code := references(definition.Value, 0)
			if code != "" {
				return code
			}
			for _, dependency := range names {
				if code = visit(dependency, depth+1); code != "" {
					return code
				}
			}
		}
		delete(active, name)
		complete[name] = true
		return ""
	}
	for _, target := range targets {
		names, code := references(target, 0)
		if code != "" {
			return code
		}
		for _, name := range names {
			if code = visit(name, 0); code != "" {
				return code
			}
		}
	}
	return ""
}
