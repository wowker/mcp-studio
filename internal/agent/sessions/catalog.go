package sessions

import (
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"mcp-studio/internal/recording"
	"net/url"
	"strings"
)

// Preserve schema field names and types while removing source-sensitive string
// values. Applying record key heuristics to 'properties' would destroy a
// legitimate password input definition before validation.
func safeSchema(value any, secrets []string) any {
	if privateSchemaKey(value, secrets) {
		return map[string]any{"$redacted": true}
	}
	return safeSchemaValues(value, secrets)
}
func safeSchemaValues(value any, secrets []string) any {
	switch v := value.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, child := range v {
			out[k] = safeSchemaValues(child, secrets)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, child := range v {
			out[i] = safeSchemaValues(child, secrets)
		}
		return out
	case string:
		safe, err := recording.Redact(v, recording.Options{SecretValues: secrets})
		if err != nil {
			return map[string]any{"$redacted": true}
		}
		return safe.Value
	}
	return value
}
func safeCatalog(tools []*sdk.Tool, secrets []string) []map[string]any {
	out := []map[string]any{}
	for _, tool := range tools {
		if tool == nil {
			continue
		}
		row := map[string]any{"name": safeSchema(tool.Name, secrets), "description": safeSchema(tool.Description, secrets), "inputSchema": safeSchema(toolSchema(encode(tool.InputSchema)), secrets)}
		if tool.OutputSchema != nil {
			row["outputSchema"] = safeSchema(toolSchema(encode(tool.OutputSchema)), secrets)
		}
		out = append(out, row)
	}
	return out
}

func safeArguments(args []string, secrets []string) []string {
	out := make([]string, len(args))
	for i, arg := range args {
		safe := safeSchema(arg, secrets)
		if decoded, err := url.QueryUnescape(arg); err == nil {
			if _, ok := safeSchema(decoded, secrets).(string); !ok {
				safe = map[string]any{"$redacted": true}
			}
		}
		if text, ok := safe.(string); ok {
			out[i] = text
		} else {
			out[i] = "[redacted personal value]"
		}
	}
	return out
}

func safeLabel(value string, secrets []string) string {
	safe := safeSchema(value, secrets)
	if text, ok := safe.(string); ok {
		return text
	}
	return "[redacted]"
}

func privateSchemaKey(value any, secrets []string) bool {
	switch v := value.(type) {
	case map[string]any:
		for key, child := range v {
			decoded, _ := url.QueryUnescape(key)
			for _, secret := range secrets {
				if secret != "" && (strings.Contains(key, secret) || strings.Contains(decoded, secret)) {
					return true
				}
			}
			if privateSchemaKey(child, secrets) {
				return true
			}
		}
	case []any:
		for _, child := range v {
			if privateSchemaKey(child, secrets) {
				return true
			}
		}
	}
	return false
}
