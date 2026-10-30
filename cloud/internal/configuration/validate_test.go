package configuration

import (
	"encoding/json"
	"mcp-studio/internal/wire"
	"os"
	"testing"
)

func validConnection() wire.ConnectionInput {
	return wire.ConnectionInput{Name: "Demo", Transport: "streamable-http", Channel: "browser", Endpoint: "https://mcp.example.test/mcp?workspace=demo", TimeoutMs: 10000, AuthMode: "none", Args: []string{}, Headers: []wire.ConfigEntry{}, Env: []wire.ConfigEntry{}, OauthScopes: []string{}}
}
func TestConnectionBoundaries(t *testing.T) {
	for _, tc := range []struct {
		name   string
		mutate func(*wire.ConnectionInput)
		valid  bool
	}{
		{"public query", func(c *wire.ConnectionInput) {}, true}, {"username", func(c *wire.ConnectionInput) { c.Endpoint = "https://user:pass@example.test/mcp" }, false}, {"fragment", func(c *wire.ConnectionInput) { c.Endpoint += "#secret" }, false}, {"secret query", func(c *wire.ConnectionInput) { c.Endpoint = "https://example.test/?access_token=synthetic" }, false}, {"encoded secret key", func(c *wire.ConnectionInput) { c.Endpoint = "https://example.test/?api%5Fkey=synthetic" }, false}, {"reference query", func(c *wire.ConnectionInput) { c.Endpoint = "https://example.test/?workspace={{WORKSPACE}}" }, true}, {"URL protocol", func(c *wire.ConnectionInput) { c.Endpoint = "file:///etc/passwd" }, false}, {"raw authorization", func(c *wire.ConnectionInput) {
			c.Headers = []wire.ConfigEntry{{Name: "Authorization", Value: "Bearer synthetic"}}
		}, false}, {"auth reference", func(c *wire.ConnectionInput) {
			c.Headers = []wire.ConfigEntry{{Name: "Authorization", Value: "Bearer {{TOKEN}}"}}
		}, true}, {"duplicate headers", func(c *wire.ConnectionInput) {
			c.Headers = []wire.ConfigEntry{{Name: "X-Demo", Value: "one"}, {Name: "x-demo", Value: "two"}}
		}, false}, {"browser forbidden header", func(c *wire.ConnectionInput) { c.Headers = []wire.ConfigEntry{{Name: "Cookie", Value: "{{TOKEN}}"}} }, false}, {"header injection", func(c *wire.ConnectionInput) { c.Headers = []wire.ConfigEntry{{Name: "X-Demo", Value: "a\r\nb"}} }, false}, {"stdio browser", func(c *wire.ConnectionInput) { c.Transport = "stdio"; c.Command = "node" }, false}, {"stdio configured", func(c *wire.ConnectionInput) {
			c.Transport = "stdio"
			c.Channel = "agent"
			c.Endpoint = ""
			c.Command = "node"
			c.Args = []string{"server.js"}
			c.Cwd = "/Users/demo/project"
		}, true}, {"stdio with HTTP", func(c *wire.ConnectionInput) { c.Transport = "stdio"; c.Channel = "agent"; c.Command = "node" }, false}, {"shell command string", func(c *wire.ConnectionInput) {
			c.Transport = "stdio"
			c.Channel = "agent"
			c.Endpoint = ""
			c.Command = "node server.js"
		}, false}, {"unknown mode", func(c *wire.ConnectionInput) { c.AuthMode = "shared" }, false}, {"timeout", func(c *wire.ConnectionInput) { c.TimeoutMs = 0 }, false}} {
		t.Run(tc.name, func(t *testing.T) {
			c := validConnection()
			tc.mutate(&c)
			code := ValidateConnection(c)
			if (code == "") != tc.valid {
				t.Fatalf("valid=%v safe code=%s", tc.valid, code)
			}
		})
	}
}
func TestVariableValues(t *testing.T) {
	for _, tc := range []struct {
		name, kind, raw  string
		sensitive, valid bool
	}{
		{"ZERO", "number", "0", false, true}, {"FALSE", "boolean", "false", false, true}, {"JSON", "json", "null", false, true}, {"EMPTY", "string", "\"\"", false, true}, {"SECRET", "string", "", true, true}, {"SECRET", "string", "\"synthetic\"", true, false}, {"N", "number", "\"3\"", false, false}, {"N", "number", "\"{{REF}}\"", false, true}, {"bad-name", "string", "\"x\"", false, false}, {"N", "number", "1e400", false, false}, {"J", "json", "{}{}", false, false}} {
		t.Run(tc.name+tc.raw, func(t *testing.T) {
			c := wire.VariableInput{Name: tc.name, Type: tc.kind, ValueJSON: tc.raw, Sensitive: tc.sensitive}
			if (ValidateVariable(c) == "") != tc.valid {
				t.Fatalf("unexpected value validation for %s", tc.kind)
			}
		})
	}
}

func TestSharedConfigurationVectors(t *testing.T) {
	body, err := os.ReadFile("../../contracts/fixtures/configuration-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			ID, Kind string
			Input    json.RawMessage
			Valid    bool
		}
	}
	if err = json.Unmarshal(body, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, tc := range fixture.Cases {
		t.Run(tc.ID, func(t *testing.T) {
			code := ""
			if tc.Kind == "connection" {
				var c wire.ConnectionInput
				json.Unmarshal(tc.Input, &c)
				code = ValidateConnection(c)
			} else {
				var v wire.VariableInput
				json.Unmarshal(tc.Input, &v)
				code = ValidateVariable(v)
			}
			if (code == "") != tc.Valid {
				t.Fatalf("unexpected shared vector: %s", code)
			}
		})
	}
}

func TestRecognizableSecretInNestedPublicVariableIsRejected(t *testing.T) {
	v := wire.VariableInput{Name: "PUBLIC", Type: "json", ValueJSON: `{"nested":[{"value":"Bearer synthetic-private-value"}]}`}
	if ValidateVariable(v) != "secret_in_shared_configuration" {
		t.Fatal("recognized nested credential reached shared definition")
	}
}
