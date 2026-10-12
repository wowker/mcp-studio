package contracts

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// TestSemantics maps the exact shared JSON vectors to Go values. It is an M0
// contract experiment, not an implementation of runtime or security features.
func TestSemantics(t *testing.T) {
	data, err := os.ReadFile("../../contracts/fixtures/semantics-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		ContractVersion string `json:"contractVersion"`
		Cases           []struct {
			ID, Kind, Source string
			Input            map[string]any
			Expected         any
		}
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.ContractVersion != "1.0.0" {
		t.Fatal("unsupported contract version")
	}
	seen := map[string]bool{}
	for _, vector := range fixture.Cases {
		if seen[vector.ID] {
			t.Fatalf("duplicate vector: %s", vector.ID)
		}
		seen[vector.ID] = true
		t.Run(vector.ID, func(t *testing.T) {
			got := evaluate(vector.Kind, vector.Input)
			encoded, err := json.Marshal(got)
			if err != nil {
				t.Fatal(err)
			}
			var normalized any
			if err := json.Unmarshal(encoded, &normalized); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(normalized, vector.Expected) {
				t.Errorf("got %s; want %v", encoded, vector.Expected)
			}
		})
	}
}
