// Package jsonnumber bounds lexical work before any rational-number operation.
package jsonnumber

import (
	"encoding/json"
	"errors"
	"math"
	"strconv"
	"strings"
)

// Normalize returns the shortest decimal spelling of the binary64 value used
// by the browser's JSON Number. Bounded underflow becomes zero consistently;
// the original encoded JSON body string remains unchanged in the snapshot.
func Normalize(raw string) (json.Number, error) {
	mantissa := raw
	exponent := ""
	if i := strings.IndexAny(raw, "eE"); i >= 0 {
		mantissa = raw[:i]
		exponent = raw[i+1:]
	}
	digits := 0
	for _, char := range mantissa {
		if char >= '0' && char <= '9' {
			digits++
		}
	}
	if digits > 128 {
		return "", errors.New("numeric mantissa limit")
	}
	if exponent != "" {
		sign := 1
		if exponent[0] == '+' {
			exponent = exponent[1:]
		} else if exponent[0] == '-' {
			sign = -1
			exponent = exponent[1:]
		}
		exponent = strings.TrimLeft(exponent, "0")
		if exponent == "" {
			exponent = "0"
		}
		if len(exponent) > 3 {
			return "", errors.New("numeric exponent limit")
		}
		n, err := strconv.Atoi(exponent)
		if err != nil || sign*n < -324 || sign*n > 324 {
			return "", errors.New("numeric exponent limit")
		}
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || math.IsInf(value, 0) || math.IsNaN(value) {
		return "", errors.New("nonfinite JSON number")
	}
	if value == 0 {
		return json.Number("0"), nil
	}
	return json.Number(String(value)), nil
}

// String uses ECMAScript's fixed/exponential notation thresholds for source
// matching, so numeric 2.0 taints both the Number 2 and textual echoes "2".
func String(value float64) string {
	if value == 0 {
		return "0"
	}
	absolute := math.Abs(value)
	if absolute >= 1e-6 && absolute < 1e21 {
		return strconv.FormatFloat(value, 'f', -1, 64)
	}
	spelling := strconv.FormatFloat(value, 'e', -1, 64)
	parts := strings.Split(spelling, "e")
	exponent, _ := strconv.Atoi(parts[1])
	sign := ""
	if exponent >= 0 {
		sign = "+"
	}
	return parts[0] + "e" + sign + strconv.Itoa(exponent)
}
