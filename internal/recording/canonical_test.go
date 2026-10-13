package recording

import (
	"strings"
	"testing"
)

func TestCanonicalFrozenEnvelope(t *testing.T) {
	got, err := Canonical(`{"z":0,"frozenDigest":"ignored","😀":"<>&","é":1,"nested":{"frozenDigest":"included"},"a":"\u2028"}`)
	want := "{\"a\":\"\u2028\",\"nested\":{\"frozenDigest\":\"included\"},\"z\":0,\"é\":1,\"😀\":\"<>&\"}"
	if err != nil || got != want {
		t.Fatalf("got %q %v want %q", got, err, want)
	}
	first, err := Digest(`{"a":1,"frozenDigest":"x"}`)
	if err != nil {
		t.Fatal(err)
	}
	second, _ := Digest(`{"frozenDigest":"y","a":1.0}`)
	if first == "" || first != second {
		t.Fatal("digest not stable across equivalent outer integers and omitted top digest")
	}
	changed, _ := Digest(`{"a":2}`)
	if changed == first {
		t.Fatal("digest omitted changed frozen content")
	}
}

func TestCanonicalRejectsAmbiguousJSON(t *testing.T) {
	for _, raw := range []string{`{"a":1,"a":2}`, `{"x":{"a":1,"a":2}}`, `{"x":"\ud800"}`, `{"x":"\udc00"}`, `{"x":9007199254740992}`, `{"x":1.1}`, `{} {}`, "{\"x\":\"\xff\"}"} {
		t.Run(raw, func(t *testing.T) {
			if _, err := Canonical(raw); err == nil {
				t.Fatal("ambiguous or unsafe envelope accepted")
			}
		})
	}
}

func TestNumericTokenBoundsBeforeRationalParsing(t *testing.T) {
	for _, raw := range []string{`{"n":1e1000000000}`, `{"n":1e-1000000000}`, `{"n":` + strings.Repeat("9", 1000) + `}`} {
		if _, err := Parse(raw, false); err == nil {
			t.Fatal("unboundednumeric body accepted")
		}
		if _, err := Canonical(raw); err == nil {
			t.Fatal("unboundednumeric envelope accepted")
		}
	}
}
