package sessions

import (
	"encoding/json"
	sdk "github.com/modelcontextprotocol/go-sdk/mcp"
	"testing"
)

func TestCatalogPreservesSensitivePropertySchemaButMasksSecretAnnotations(t *testing.T) {
	tool := &sdk.Tool{Name: "tool", InputSchema: map[string]any{"type": "object", "properties": map[string]any{"password": map[string]any{"type": "string", "description": "private-token"}}}}
	safe := safeCatalog([]*sdk.Tool{tool}, []string{"private-token"})
	b, _ := json.Marshal(safe)
	var out []map[string]any
	json.Unmarshal(b, &out)
	schema := out[0]["inputSchema"].(map[string]any)
	password := schema["properties"].(map[string]any)["password"].(map[string]any)
	if password["type"] != "string" {
		t.Fatal("schema property masked")
	}
	if contains(string(b), "private-token") {
		t.Fatal("secret annotation leaked")
	}
}
func TestNativePromptMasksEncodedKnownSecret(t *testing.T) {
	safe := safeArguments([]string{"--credential=a%2Fb", "literal"}, []string{"a/b"})
	if safe[0] != "[redacted personal value]" || safe[1] != "literal" {
		t.Fatal("encoded secret printed", safe)
	}
}
func TestKnownSecretSchemaStructureKeysNeverReachCatalogOrSnapshot(t *testing.T) {
	secret := "private-schema-key"
	schema := map[string]any{"type": "object", "properties": map[string]any{secret: map[string]any{"type": "string"}, "token": map[string]any{"type": "string"}, "Authorization": map[string]any{"type": "string"}}}
	safe := safeSchema(schema, []string{secret})
	b, _ := json.Marshal(safe)
	if contains(string(b), secret) {
		t.Fatal("private structure key leaked", string(b))
	}
	tool := &sdk.Tool{Name: "tool", InputSchema: schema}
	b, _ = json.Marshal(safeCatalog([]*sdk.Tool{tool}, []string{secret}))
	if contains(string(b), secret) {
		t.Fatal("catalog key leaked")
	}
	public := safeSchema(map[string]any{"properties": map[string]any{"token": map[string]any{"type": "string"}, "Authorization": map[string]any{"type": "string"}}}, []string{secret})
	b, _ = json.Marshal(public)
	if !contains(string(b), `"token"`) || !contains(string(b), `"Authorization"`) {
		t.Fatal("normal schema keys were rejected", string(b))
	}
}
