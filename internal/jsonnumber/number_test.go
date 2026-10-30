package jsonnumber

import (
	"math"
	"strings"
	"testing"
)

// B15: jsonnumber guards lexical work before any rational-number operation.
// It is called from recording/redaction, recording/canonical, platform/records
// and schema/check, so the numeric bounds are a shared security boundary (D09).
// These assertions lock the lexical limits and the ECMAScript spelling thresholds.

func TestNormalizeShortestDecimalSpelling(t *testing.T) {
	cases := []struct{ raw, want string }{
		{"0", "0"},
		{"2.0", "2"},
		{"-0", "0"},
		{"-0.0", "0"},
		{"0.1", "0.1"},
		{"1e3", "1000"},
		{"1E3", "1000"},
		{"1e0003", "1000"},
		{"123.456", "123.456"},
	}
	for _, tc := range cases {
		got, err := Normalize(tc.raw)
		if err != nil {
			t.Fatalf("Normalize(%q) unexpected error: %v", tc.raw, err)
		}
		if string(got) != tc.want {
			t.Errorf("Normalize(%q) = %q, want %q", tc.raw, got, tc.want)
		}
	}
}

func TestNormalizeRejectsMantissaOver128Digits(t *testing.T) {
	allowed := "1" + strings.Repeat("0", 127) // exactly 128 digits
	if _, err := Normalize(allowed); err != nil {
		t.Fatalf("Normalize(128 digits) rejected: %v", err)
	}
	rejected := "1" + strings.Repeat("0", 128) // 129 digits
	if _, err := Normalize(rejected); err == nil {
		t.Fatal("Normalize(129 digits) should be rejected with numeric mantissa limit")
	}
}

func TestNormalizeRejectsExponentOutOfRange(t *testing.T) {
	cases := []string{"1e400", "1e-400", "1e1234", "1e325", "1e-325"}
	for _, raw := range cases {
		if _, err := Normalize(raw); err == nil {
			t.Errorf("Normalize(%q) should be rejected (numeric exponent limit)", raw)
		}
	}
}

func TestNormalizeBoundedUnderflowBecomesZero(t *testing.T) {
	got, err := Normalize("1e-324")
	if err != nil {
		t.Fatalf("Normalize(1e-324) unexpected error: %v", err)
	}
	if string(got) != "0" {
		t.Errorf("bounded underflow should normalize to 0, got %q", got)
	}
}

func TestNormalizeRejectsNonfinite(t *testing.T) {
	cases := []string{"1e324", "abc", "1e", "", "NaN", "Infinity"}
	for _, raw := range cases {
		if _, err := Normalize(raw); err == nil {
			t.Errorf("Normalize(%q) should be rejected as nonfinite JSON number", raw)
		}
	}
}

func TestStringUsesECMAScriptThresholds(t *testing.T) {
	cases := []struct {
		value float64
		want  string
	}{
		{0, "0"},
		{math.Copysign(0, -1), "0"}, // real negative zero, not the constant 0
		{1, "1"},
		{123.456, "123.456"},
		{1e-6, "0.000001"},              // lower fixed threshold is inclusive
		{1e-7, "1e-7"},                  // below 1e-6 switches to exponential
		{-1e-7, "-1e-7"},
		{1e20, "100000000000000000000"}, // below 1e21 stays fixed
		{1e21, "1e+21"},                 // 1e21 switches to exponential
		{-1e21, "-1e+21"},
	}
	for _, tc := range cases {
		if got := String(tc.value); got != tc.want {
			t.Errorf("String(%v) = %q, want %q", tc.value, got, tc.want)
		}
	}
}

func TestStringExponentialCarriesExplicitPositiveSign(t *testing.T) {
	// ECMAScript keeps the "+" for non-negative exponents; dropping it would
	// break source matching against textual echoes of the same value.
	if got := String(1e21); !strings.Contains(got, "e+") {
		t.Errorf("String(1e21) = %q, expected explicit positive exponent sign", got)
	}
	if got := String(1e-7); !strings.Contains(got, "e-") {
		t.Errorf("String(1e-7) = %q, expected negative exponent sign", got)
	}
}
