package platform

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/configuration"
	"mcp-studio/internal/environment"
	"mcp-studio/internal/wire"
	"net/url"
	"strings"
)

// Public configuration may retain missing references for repair. Sensitive query
// references, including transitively sensitive values, can never be shared.
func (a *App) validateConnectionReferences(ctx context.Context, q configurationQuerier, projectID, connectionID string, input wire.ConnectionInput) string {
	variables, err := loadConfigurationVariables(ctx, q, projectID)
	if err != nil {
		return "database_unavailable"
	}
	result := environment.Resolve(environment.Input{Layers: environment.BuildLayers(variables, projectID, connectionID, input.EnvironmentID), Personal: map[string]any{}})
	if result.Error != "" {
		return result.Error
	}
	rows := map[string]environment.Row{}
	for _, row := range result.Rows {
		rows[row.Name] = row
	}
	parts := strings.SplitN(input.Endpoint, "?", 2)
	if len(parts) == 2 {
		query, err := url.QueryUnescape(parts[1])
		if err != nil {
			return "invalid_query"
		}
		for _, match := range environment.Reference.FindAllStringSubmatch(query, -1) {
			if row, ok := rows[match[1]]; ok && row.Sensitive {
				return "sensitive_query_reference"
			}
		}
	}
	path := strings.SplitN(input.Endpoint, "?", 2)[0]
	decoded, err := url.PathUnescape(path)
	if err != nil {
		return "invalid_endpoint"
	}
	for _, match := range environment.Reference.FindAllStringSubmatch(decoded, -1) {
		if row, ok := rows[match[1]]; ok && row.Sensitive {
			return "sensitive_url_reference"
		}
	}
	resolvedEndpoint := environment.Reference.ReplaceAllStringFunc(input.Endpoint, func(token string) string {
		value, ok := result.Read(token[2 : len(token)-2])
		if !ok || value.Sensitive {
			return token
		}
		if text, ok := value.Value.(string); ok {
			return text
		}
		body, _ := json.Marshal(value.Value)
		return string(body)
	})
	resolvedInput := input
	resolvedInput.Endpoint = resolvedEndpoint
	return configuration.ValidateConnection(resolvedInput)
}
