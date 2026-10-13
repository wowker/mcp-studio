package environment

import (
	"encoding/json"
	"math"
	"os"
	"reflect"
	"testing"
)

func TestProductionSharedVectors(t *testing.T) {
	body, err := os.ReadFile("../../contracts/fixtures/semantics-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Cases []struct {
			ID, Kind string
			Input    json.RawMessage
			Expected json.RawMessage
		}
	}
	if err = json.Unmarshal(body, &fixture); err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, v := range fixture.Cases {
		if v.Kind != "environment" {
			continue
		}
		count++
		t.Run(v.ID, func(t *testing.T) {
			var input Input
			if err := json.Unmarshal(v.Input, &input); err != nil {
				t.Fatal(err)
			}
			result := Resolve(input)
			var actual any
			if result.Error != "" {
				actual = map[string]any{"error": result.Error}
			} else {
				b, _ := json.Marshal(result.Rows)
				json.Unmarshal(b, &actual)
			}
			var expected any
			json.Unmarshal(v.Expected, &expected)
			if !reflect.DeepEqual(actual, expected) {
				t.Fatalf("safe result differs: got %#v want %#v", actual, expected)
			}
		})
	}
	if count != 14 {
		t.Fatalf("expected all14 shared environment vectors, got %d", count)
	}
}
func TestResolverPrivateValueAndComplexity(t *testing.T) {
	result := Resolve(Input{Layers: []Layer{{Source: "base-project", Definitions: []Definition{{ID: "s", Name: "S", Type: "string", Sensitive: true}, {ID: "d", Name: "D", Type: "json", Value: map[string]any{"nested": "{{S}}"}}}}}, Personal: map[string]any{"s": "synthetic-personal-value"}, Targets: []string{"D"}})
	if result.Rows[0].Value != nil || !result.Rows[0].Sensitive {
		t.Fatal("taint exposed")
	}
	v, ok := result.Read("D")
	if !ok || v.Value.(map[string]any)["nested"] != "synthetic-personal-value" {
		t.Fatal("private resolution missing")
	}
	var rows []Definition
	for n := 0; n < 300; n++ {
		rows = append(rows, Definition{ID: string(rune(n + 1000)), Name: string(rune(n + 1000)), Type: "string", Value: "value"})
	}
	if Resolve(Input{Layers: []Layer{{Definitions: rows}}}).Error != "resolution_limit" {
		t.Fatal("unbounded definitions")
	}
}
func TestPersonalJSONCannotSerializeNonFiniteAsNull(t *testing.T) {
	input := Input{Layers: []Layer{{Source: "base-project", Definitions: []Definition{{ID: "s", Name: "S", Sensitive: true, Type: "json"}}}}, Personal: map[string]any{"s": map[string]any{"nested": math.Inf(1)}}}
	r := Resolve(input)
	if len(r.Rows) != 1 || r.Rows[0].Status != "type_error" {
		t.Fatal("non-finite private JSON accepted")
	}
	if _, ok := r.Read("S"); ok {
		t.Fatal("invalid personal JSON available for wire")
	}
}
