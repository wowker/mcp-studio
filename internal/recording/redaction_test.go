package recording

import (
	"mcp-studio/internal/wire"
	"reflect"
	"strings"
	"testing"
)

func TestRedactionDerivedSecretsAndPointers(t *testing.T) {
	value := map[string]any{"request": map[string]any{"token": "synthetic-secret", "n": 0, "ok": false, "null": nil}, "response": map[string]any{"echo": "server returned synthetic-secret", "nested": map[string]any{"a/b": "sensitive"}, "email": "member@example.test"}, "protocol": map[string]any{"url": "https://host.test?token=synthetic-secret"}}
	result, err := Redact(value, Options{ProjectPointers: []string{"/response/nested/a~1b"}})
	if err != nil {
		t.Fatal(err)
	}
	encoded := Encode(result.Value)
	for _, secret := range []string{"synthetic-secret", "member@example.test", "sensitive"} {
		if strings.Contains(encoded, secret) {
			t.Fatalf("secret %q leaked %s", secret, encoded)
		}
	}
	if !strings.Contains(encoded, `"n":0`) || !strings.Contains(encoded, `"ok":false`) || !strings.Contains(encoded, `"null":null`) {
		t.Fatal("falsy public values lost")
	}
	if len(result.Markers) != 5 {
		t.Fatalf("markers %+v", result.Markers)
	}
	if value["request"].(map[string]any)["token"] != "synthetic-secret" {
		t.Fatal("redaction mutated raw debug memory")
	}
}

func TestRedactionAdditionalPathMustExistAndBinaryIsOmitted(t *testing.T) {
	for _, pointer := range []string{"not-pointer", "/x~2", "/missing"} {
		if _, err := Redact(map[string]any{"x": "a"}, Options{AdditionalPointers: []string{pointer}}); err == nil {
			t.Fatalf("invalid additional pointer accepted %s", pointer)
		}
	}
	result, err := Redact(map[string]any{"image": map[string]any{"type": "image", "mimeType": "image/png", "data": "base64-secret", "url": "https://host.test/secret"}}, Options{})
	if err != nil {
		t.Fatal(err)
	}
	if encoded := Encode(result.Value); strings.Contains(encoded, "base64-secret") || strings.Contains(encoded, "/secret") {
		t.Fatalf("binary leaked %s", encoded)
	}
}

func TestRestoreRemovesWholeTopLevelRedactedParameters(t *testing.T) {
	value := map[string]any{"credentials": map[string]any{"token": map[string]any{"$redacted": true}, "public": 1}, "literal": "[REDACTED]", "n": 0, "false": false, "null": nil}
	got := RestoreRequest(value, []wire.RedactionMarker{{Path: "/credentials/token", Reason: "default"}})
	want := map[string]any{"literal": "[REDACTED]", "n": 0, "false": false, "null": nil}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("restored %+v want %+v", got, want)
	}
}
