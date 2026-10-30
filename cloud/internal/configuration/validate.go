// Package configuration validates public configuration before it reaches persistence.
// It rejects recognizable secrets; arbitrary business secrets still require users to
// mark variables sensitive. Errors never contain submitted values.
package configuration

import (
	"encoding/json"
	"mcp-studio/internal/environment"
	"mcp-studio/internal/wire"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
)

var variableName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]{0,127}$`)
var headerName = regexp.MustCompile("^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
var knownSecret = regexp.MustCompile(`(?i)(^|[^a-z0-9])(authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|password|passwd|secret|token|access[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|client[-_]?secret|credential|signature)([^a-z0-9]|$)`)
var tokenShape = regexp.MustCompile(`(?i)(bearer\s+[A-Za-z0-9._~+/=-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{16,})`)

func secretLiteral(value string) bool {
	return tokenShape.MatchString(environment.Reference.ReplaceAllString(value, ""))
}
func entries(entries []wire.ConfigEntry, headers bool) string {
	if len(entries) > 64 {
		return "configuration_limit"
	}
	seen := map[string]bool{}
	for _, e := range entries {
		key := e.Name
		if headers {
			key = strings.ToLower(key)
			if !headerName.MatchString(e.Name) {
				return "invalid_header"
			}
			if key == "cookie" || key == "set-cookie" || key == "host" || key == "origin" || key == "referer" || key == "content-length" || key == "connection" || strings.HasPrefix(key, "sec-") || strings.HasPrefix(key, "proxy-") {
				return "forbidden_header"
			}
		} else if !variableName.MatchString(key) {
			return "invalid_environment_name"
		}
		if seen[key] {
			return "duplicate_entry"
		}
		seen[key] = true
		if len(e.Value) > 8192 || strings.ContainsAny(e.Value, "\x00\r\n") {
			return "invalid_entry"
		}
		if secretLiteral(e.Value) {
			return "secret_in_shared_configuration"
		}
		if knownSecret.MatchString(e.Name) {
			literal := strings.TrimSpace(environment.Reference.ReplaceAllString(e.Value, ""))
			literal = strings.TrimSpace(strings.TrimPrefix(literal, "Bearer"))
			if len(environment.Reference.FindAllString(e.Value, -1)) == 0 || literal != "" {
				return "secret_in_shared_configuration"
			}
		}
	}
	return ""
}
func ValidateConnection(c wire.ConnectionInput) string {
	if strings.TrimSpace(c.Name) == "" || len(c.Name) > 120 || strings.ContainsAny(c.Name, "\x00\r\n") {
		return "invalid_name"
	}
	if c.TimeoutMs < 1000 || c.TimeoutMs > 300000 {
		return "invalid_timeout"
	}
	if c.Channel != "browser" && c.Channel != "agent" {
		return "invalid_channel"
	}
	if c.Headers == nil || c.Env == nil || c.Args == nil || c.OauthScopes == nil {
		return "invalid_input"
	}
	if c.AuthMode != "none" && c.AuthMode != "token" && c.AuthMode != "oauth" && c.AuthMode != "reference" {
		return "invalid_auth_mode"
	}
	if c.AuthMode != "reference" && c.AuthReferenceID != "" {
		return "invalid_auth_reference"
	}
	if c.AuthMode == "reference" && c.AuthReferenceID == "" {
		return "missing_auth_reference"
	}
	if c.AuthMode != "oauth" && (c.OauthClientID != "" || len(c.OauthScopes) > 0) {
		return "invalid_oauth_configuration"
	}
	if len(c.OauthScopes) > 32 || len(c.OauthClientID) > 2048 || strings.ContainsAny(c.OauthClientID, "\x00\r\n") || secretLiteral(c.OauthClientID) {
		return "invalid_oauth_configuration"
	}
	for _, scope := range c.OauthScopes {
		if strings.TrimSpace(scope) == "" || len(scope) > 256 || strings.ContainsAny(scope, " \r\n\x00") {
			return "invalid_oauth_scope"
		}
	}
	if c.Transport == "stdio" {
		if c.Channel != "agent" || c.Endpoint != "" || len(c.Headers) > 0 || c.AuthMode != "none" {
			return "invalid_stdio_configuration"
		}
		if strings.TrimSpace(c.Command) == "" || len(c.Command) > 4096 || strings.ContainsAny(c.Command, "\x00\r\n") || strings.ContainsAny(c.Command, ";&|`<>") || strings.Contains(c.Command, " ") && !filepath.IsAbs(c.Command) && !regexp.MustCompile(`^[A-Za-z]:[\\/]`).MatchString(c.Command) {
			return "invalid_command"
		}
		if len(c.Args) > 128 {
			return "configuration_limit"
		}
		for _, arg := range c.Args {
			if len(arg) > 8192 || strings.ContainsRune(arg, '\x00') || secretLiteral(arg) {
				return "invalid_argument"
			}
		}
		if c.Cwd != "" && (!filepath.IsAbs(c.Cwd) && !regexp.MustCompile(`^[A-Za-z]:[\\/]`).MatchString(c.Cwd) || strings.ContainsAny(c.Cwd, "\x00\r\n")) {
			return "invalid_cwd"
		}
		return entries(c.Env, false)
	}
	if c.Transport != "streamable-http" && c.Transport != "sse" {
		return "invalid_transport"
	}
	if c.Command != "" || len(c.Args) > 0 || c.Cwd != "" || len(c.Env) > 0 {
		return "invalid_http_configuration"
	}
	if len(c.Endpoint) > 8192 || strings.ContainsAny(c.Endpoint, "\x00\r\n ") || strings.Contains(c.Endpoint, "#") {
		return "invalid_endpoint"
	}
	// References may occur only in path/query, never the scheme or authority.
	endpoint := environment.Reference.ReplaceAllString(c.Endpoint, "reference")
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "http" && u.Scheme != "https" || u.Hostname() == "" {
		return "invalid_endpoint"
	}
	if u.User != nil {
		return "secret_in_url"
	}
	originalAuthority := strings.FieldsFunc(strings.SplitN(c.Endpoint, "://", 2)[1], func(r rune) bool { return r == '/' || r == '?' })[0]
	if strings.Contains(originalAuthority, "{{") {
		return "invalid_endpoint"
	}
	query, err := url.ParseQuery(u.RawQuery)
	if err != nil {
		return "invalid_query"
	}
	for key, values := range query {
		if knownSecret.MatchString(key) {
			return "secret_in_url"
		}
		for _, v := range values {
			if secretLiteral(v) {
				return "secret_in_url"
			}
		}
	}
	if secretLiteral(c.Endpoint) || secretLiteral(u.Path) {
		return "secret_in_url"
	}
	return entries(c.Headers, true)
}
func ValidateVariable(v wire.VariableInput) string {
	if !variableName.MatchString(v.Name) {
		return "invalid_variable_name"
	}
	if v.Type != "string" && v.Type != "number" && v.Type != "boolean" && v.Type != "json" {
		return "invalid_variable_type"
	}
	if v.Sensitive {
		if v.ValueJSON != "" {
			return "personal_value_required"
		}
		return ""
	}
	if len(v.ValueJSON) > 32768 {
		return "configuration_limit"
	}
	var value any
	if json.Unmarshal([]byte(v.ValueJSON), &value) != nil {
		return "invalid_json"
	}
	if recognizableSecret(value) {
		return "secret_in_shared_configuration"
	}
	// Expressions are validated after precedence and substitution, not as literal types.
	if hasReference(value) {
		return ""
	}
	valid := false
	switch v.Type {
	case "json":
		valid = true
	case "string":
		_, valid = value.(string)
	case "number":
		_, valid = value.(float64)
	case "boolean":
		_, valid = value.(bool)
	}
	if !valid {
		return "type_error"
	}
	return ""
}
func hasReference(value any) bool {
	switch v := value.(type) {
	case string:
		return environment.Reference.MatchString(v)
	case []any:
		for _, child := range v {
			if hasReference(child) {
				return true
			}
		}
	case map[string]any:
		for _, child := range v {
			if hasReference(child) {
				return true
			}
		}
	}
	return false
}

func recognizableSecret(value any) bool {
	switch v := value.(type) {
	case string:
		return secretLiteral(v)
	case []any:
		for _, child := range v {
			if recognizableSecret(child) {
				return true
			}
		}
	case map[string]any:
		for _, child := range v {
			if recognizableSecret(child) {
				return true
			}
		}
	}
	return false
}
