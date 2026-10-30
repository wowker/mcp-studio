package recording

import (
	"encoding/json"
	"mcp-studio/internal/wire"
	"os"
	"reflect"
	"testing"
)

func TestSharedProductionRecording(t *testing.T) {
	b, err := os.ReadFile("../../contracts/fixtures/recording-v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Version   int
		Canonical []struct{ ID, Raw, ExpectedCanonical, ExpectedDigest, Error string }
		Redaction []struct {
			ID, Error string
			Value     json.RawMessage
			Options   struct {
				SensitiveValues                     []string
				ProjectPointers, AdditionalPointers []string
			}
			Expected struct {
				Value   json.RawMessage
				Markers []wire.RedactionMarker
				Omitted bool
			}
		}
	}
	if err = json.Unmarshal(b, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Version != 1 || len(fixture.Canonical) < 7 || len(fixture.Redaction) < 13 {
		t.Fatal("unexpected shared fixture")
	}
	for _, tc := range fixture.Canonical {
		t.Run(tc.ID, func(t *testing.T) {
			got, err := Canonical(tc.Raw)
			if tc.Error != "" {
				if err == nil {
					t.Fatal("unsafe input accepted")
				}
				return
			}
			if err != nil || got != tc.ExpectedCanonical {
				t.Fatalf("canonical %q %v want %q", got, err, tc.ExpectedCanonical)
			}
			sum, err := Digest(tc.Raw)
			if err != nil || sum != tc.ExpectedDigest {
				t.Fatalf("digest %s %v want %s", sum, err, tc.ExpectedDigest)
			}
		})
	}
	for _, tc := range fixture.Redaction {
		t.Run(tc.ID, func(t *testing.T) {
			value, err := Parse(string(tc.Value), false)
			if err != nil {
				t.Fatal(err)
			}
			got, err := Redact(value, Options{SecretValues: tc.Options.SensitiveValues, ProjectPointers: tc.Options.ProjectPointers, AdditionalPointers: tc.Options.AdditionalPointers})
			if tc.Error != "" {
				if err == nil {
					t.Fatal("invalid path accepted")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			want, _ := Parse(string(tc.Expected.Value), false)
			if Encode(got.Value) != Encode(want) || !reflect.DeepEqual(got.Markers, tc.Expected.Markers) || got.Omitted != tc.Expected.Omitted {
				t.Fatalf("got %s %+v %v want %s %+v %v", Encode(got.Value), got.Markers, got.Omitted, Encode(want), tc.Expected.Markers, tc.Expected.Omitted)
			}
		})
	}
}
