package schema

import (
	"encoding/json"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func TestFormalValidation(t *testing.T) {
	cases := []struct {
		name, schema, value string
		supported, valid    bool
		errors              []Issue
	}{
		{"preserves values", `{"type":"object","properties":{"n":{"type":"number"},"b":{"type":"boolean"},"v":{"type":"null"}},"required":["n","b","v"]}`, `{"n":0,"b":false,"v":null}`, true, true, nil},
		{"nested path", `{"type":"object","properties":{"a/b":{"type":"array","items":{"type":"number"}}}}`, `{"a/b":["bad"]}`, true, false, []Issue{{"/a~1b/0", "type"}}},
		{"required path", `{"required":["missing"]}`, `{}`, true, false, []Issue{{"/missing", "required"}}},
		{"additional property", `{"additionalProperties":false}`, `{"extra":false}`, true, false, []Issue{{"/extra", "additionalProperties"}}},
		{"oneOf", `{"oneOf":[{"type":"number"},{"minimum":0}]}`, `2`, true, false, []Issue{{"", "oneOf"}}},
		{"anyOf", `{"anyOf":[{"type":"string"},{"type":"number"}]}`, `false`, true, false, []Issue{{"", "anyOf"}}},
		{"allOf", `{"allOf":[{"type":"number"},{"minimum":0}]}`, `-1`, true, false, []Issue{{"", "minimum"}}},
		{"false schema", `false`, `0`, true, false, []Issue{{"", "falseSchema"}}},
		{"2020 unevaluated", `{"allOf":[{"properties":{"n":{"type":"number"}}}],"unevaluatedProperties":false}`, `{"n":1}`, true, true, nil},
		{"2020 prefixItems", `{"prefixItems":[{"type":"number"}],"items":false}`, `[1,"x"]`, true, false, []Issue{{"/1", "falseSchema"}}},
		{"draft07 tuple", `{"$schema":"http://json-schema.org/draft-07/schema#","items":[{"type":"number"}],"additionalItems":false}`, `[1]`, true, true, nil},
		{"format annotation 07", `{"$schema":"http://json-schema.org/draft-07/schema#","format":"email"}`, `"invalid"`, true, true, nil},
		{"format annotation", `{"format":"email"}`, `"invalid"`, true, true, nil},
		{"invalid meta", `{"required":"bad"}`, `{}`, false, false, nil},
		{"invalid JSON", `{}`, `{"x":`, true, false, []Issue{{"", "json"}}},
		{"trailing JSON", `{}`, `0 1`, true, false, []Issue{{"", "json"}}},
		{"remote ref", `{"$ref":"https://example.invalid/schema"}`, `1`, false, false, nil},
		{"custom dialect", `{"$schema":"urn:custom"}`, `1`, false, false, nil},
		{"unknown keyword", `{"custom":true}`, `1`, false, false, nil},
		{"unknown format", `{"format":"custom"}`, `1`, false, false, nil},
		{"custom vocabulary", `{"$vocabulary":{"urn:custom":true}}`, `1`, false, false, nil},
		{"lookaround", `{"pattern":"(?=a)"}`, `"a"`, false, false, nil},
		{"backref", `{"pattern":"(a)\\1"}`, `"aa"`, false, false, nil},
		{"unicode escape", `{"pattern":"\\p{L}"}`, `"a"`, false, false, nil},
		{"portable pattern", `{"pattern":"^[a-z]+$"}`, `"abc"`, true, true, nil},
		{"local ref", `{"$defs":{"n":{"type":"number"}},"$ref":"#/$defs/n"}`, `3`, true, true, nil},
		{"local anchor", `{"$defs":{"n":{"$anchor":"n","type":"number"}},"$ref":"#n"}`, `3`, true, true, nil},
		{"embedded resource", `{"$id":"https://example.invalid/root","$defs":{"n":{"$id":"nested","type":"number"}},"$ref":"nested"}`, `3`, true, true, nil},
		{"id changes ref base", `{"$id":"https://example.invalid/root","$defs":{"n":{"type":"number"},"x":{"$id":"nested","$ref":"#/$defs/n"}},"$ref":"#/$defs/x"}`, `3`, false, false, nil},
		{"data keywords not schema", `{"const":{"$schema":"urn:custom","pattern":"(?=a)"}}`, `{"$schema":"urn:custom","pattern":"(?=a)"}`, true, true, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := Check(tc.schema, tc.value)
			if got.Supported != tc.supported || got.Valid != tc.valid {
				t.Fatalf("got %+v, want supported %v valid %v", got, tc.supported, tc.valid)
			}
			if tc.supported && !tc.valid && !reflect.DeepEqual(got.Errors, tc.errors) {
				t.Fatalf("errors %+v, want %+v", got.Errors, tc.errors)
			}
			if !tc.supported && got.Reason == "" {
				t.Fatal("unsupported result needs a bounded safe reason")
			}
		})
	}
}

func TestComplexityLimits(t *testing.T) {
	if got := Check(`{}`, strings.Repeat(" ", 1<<20)+`0`); got.Valid {
		t.Fatal("oversize value accepted")
	}
	if got := Check(`{}`, strings.Repeat("[", 65)+`0`+strings.Repeat("]", 65)); got.Valid {
		t.Fatal("overdeep value accepted")
	}
	if got := Check(`{}`, `[`+strings.Repeat(`0,`, 4096)+`0]`); got.Valid {
		t.Fatal("too many value nodes accepted")
	}
	if got := Check(`{"default":`+strings.Repeat("[", 65)+`0`+strings.Repeat("]", 65)+`}`, `0`); got.Supported {
		t.Fatal("overdeep schema accepted")
	}
	defs := map[string]any{"n0": map[string]any{"type": "number"}}
	for i := 1; i < 19; i++ {
		ref := map[string]any{"$ref": "#/$defs/n" + strconv.Itoa(i-1)}
		defs["n"+strconv.Itoa(i)] = map[string]any{"allOf": []any{ref, ref}}
	}
	raw, _ := json.Marshal(map[string]any{"$defs": defs, "$ref": "#/$defs/n18"})
	if got := Check(string(raw), `"bad"`); got.Supported {
		t.Fatal("exponential same-value reference graph accepted")
	}
}

// M0 remains an immutable oracle contract; production consumes its schema
// expectations after applying the explicitly selected skip paths to the value.
func TestM0SchemaVectors(t *testing.T) {
	b, err := os.ReadFile("../../contracts/fixtures/semantics-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures struct {
		Cases []struct {
			ID, Kind string
			Input    struct {
				Raw    string
				Schema json.RawMessage
				Skip   []string
			}
			Expected json.RawMessage
		}
	}
	if err = json.Unmarshal(b, &fixtures); err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, tc := range fixtures.Cases {
		if tc.Kind != "schema" {
			continue
		}
		count++
		t.Run(tc.ID, func(t *testing.T) {
			var expected struct {
				Status string
				Errors []string
			}
			if err := json.Unmarshal(tc.Expected, &expected); err != nil {
				t.Fatal(err)
			}
			raw := tc.Input.Raw
			var value any
			if json.Unmarshal([]byte(raw), &value) == nil {
				for _, p := range tc.Input.Skip {
					removeSkipped(value, strings.Split(strings.TrimPrefix(p, "/"), "/"))
				}
				encoded, _ := json.Marshal(value)
				raw = string(encoded)
			}
			got := Check(string(tc.Input.Schema), raw)
			wantSupported := expected.Status != "unsupported_schema"
			wantValid := expected.Status == "valid"
			if got.Supported != wantSupported || got.Valid != wantValid {
				t.Fatalf("got %+v want %s", got, expected.Status)
			}
			if wantSupported {
				var paths []string
				for _, e := range got.Errors {
					paths = append(paths, e.Path+"#"+e.Code)
				}
				if len(paths) != len(expected.Errors) || len(paths) > 0 && !reflect.DeepEqual(paths, expected.Errors) {
					t.Fatalf("errors %v want %v", paths, expected.Errors)
				}
			}
		})
	}
	if count != 17 {
		t.Fatalf("schema vector count %d", count)
	}
}

func removeSkipped(v any, path []string) {
	if len(path) == 0 {
		return
	}
	m, ok := v.(map[string]any)
	if !ok {
		return
	}
	if len(path) == 1 {
		delete(m, path[0])
		return
	}
	removeSkipped(m[path[0]], path[1:])
}

func TestSharedProductionVectors(t *testing.T) {
	b, err := os.ReadFile("../../contracts/fixtures/schema-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Version int
		Cases   []struct {
			ID            string
			Schema, Value json.RawMessage
			Expected      struct {
				Supported, Valid bool
				ErrorPaths       []string
			}
		}
	}
	if err = json.Unmarshal(b, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Version != 1 || len(fixture.Cases) < 28 {
		t.Fatal("unexpected fixture version/count")
	}
	for _, tc := range fixture.Cases {
		t.Run(tc.ID, func(t *testing.T) {
			got := Check(string(tc.Schema), string(tc.Value))
			if got.Supported != tc.Expected.Supported || got.Valid != tc.Expected.Valid {
				t.Fatalf("got %+v want %+v", got, tc.Expected)
			}
			if tc.Expected.ErrorPaths != nil {
				paths := []string{}
				for _, e := range got.Errors {
					if len(paths) == 0 || paths[len(paths)-1] != e.Path {
						paths = append(paths, e.Path)
					}
				}
				if !reflect.DeepEqual(paths, tc.Expected.ErrorPaths) {
					t.Fatalf("paths %v want %v; issues %+v", paths, tc.Expected.ErrorPaths, got.Errors)
				}
			}
		})
	}
}

func TestNumericLexicalBudgetBeforeFormalValidator(t *testing.T) {
	for _, raw := range []string{`1e1000000000`, `1e-1000000000`, strings.Repeat("9", 1000)} {
		t.Run(raw[:min(len(raw), 24)], func(t *testing.T) {
			defer func() {
				if panicValue := recover(); panicValue != nil {
					t.Fatalf("numericinput reached unsafeformalvalidator: %v", panicValue)
				}
			}()
			got := Check(`{"type":"number","minimum":0}`, raw)
			if got.Valid {
				t.Fatal("unboundednumeric input accepted")
			}
		})
	}
	for _, raw := range []string{`{"minimum":1e1000000000}`, `{"enum":[1e-1000000000]}`} {
		if got := Check(raw, `0`); got.Supported {
			t.Fatal("unboundedschema number accepted")
		}
	}
}
