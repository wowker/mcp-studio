package recording

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"mcp-studio/internal/jsonnumber"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Canonical is the versioned record-envelope encoding. JSON body strings remain
// strings; only the top-level transport digest is excluded from its own digest.
func Canonical(raw string) (string, error) {
	value, err := Parse(raw, true)
	if err != nil {
		return "", err
	}
	object, ok := value.(map[string]any)
	if !ok {
		return "", errors.New("envelope must be object")
	}
	delete(object, "frozenDigest")
	return Encode(value), nil
}
func Digest(raw string) (string, error) {
	canonical, err := Canonical(raw)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256([]byte(canonical))
	return hex.EncodeToString(sum[:]), nil
}

// Parse rejects duplicate keys and Unicode replacement ambiguities that the
// ordinary Go decoder accepts. Safe integers are required for outer envelopes;
// MCP body numbers remain JSON numbers without changing their original string.
func Parse(raw string, safeIntegers bool) (any, error) {
	if len(raw) > 32<<20 || !utf8.ValidString(raw) || !validSurrogates(raw) {
		return nil, errors.New("invalid JSON text")
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.UseNumber()
	nodes := 0
	var read func(int) (any, error)
	read = func(depth int) (any, error) {
		nodes++
		if depth > 64 || nodes > 65536 {
			return nil, errors.New("JSON complexity limit")
		}
		token, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		switch v := token.(type) {
		case json.Delim:
			switch v {
			case '{':
				object := map[string]any{}
				for decoder.More() {
					key, err := decoder.Token()
					if err != nil {
						return nil, err
					}
					name, ok := key.(string)
					if !ok {
						return nil, errors.New("invalid object key")
					}
					if _, exists := object[name]; exists {
						return nil, errors.New("duplicate JSON key")
					}
					child, err := read(depth + 1)
					if err != nil {
						return nil, err
					}
					object[name] = child
				}
				end, err := decoder.Token()
				if err != nil || end != json.Delim('}') {
					return nil, errors.New("invalid object")
				}
				return object, nil
			case '[':
				array := []any{}
				for decoder.More() {
					child, err := read(depth + 1)
					if err != nil {
						return nil, err
					}
					array = append(array, child)
				}
				end, err := decoder.Token()
				if err != nil || end != json.Delim(']') {
					return nil, errors.New("invalid array")
				}
				return array, nil
			default:
				return nil, errors.New("unexpected delimiter")
			}
		case json.Number:
			if _, err := jsonnumber.Normalize(string(v)); err != nil {
				return nil, err
			}
			if safeIntegers {
				r, ok := new(big.Rat).SetString(string(v))
				if !ok || !r.IsInt() || !r.Num().IsInt64() || r.Num().Int64() < -9007199254740991 || r.Num().Int64() > 9007199254740991 {
					return nil, errors.New("unsafe envelope number")
				}
				return json.Number(r.Num().String()), nil
			}
			return v, nil
		default:
			return v, nil
		}
	}
	value, err := read(0)
	if err != nil {
		return nil, err
	}
	if _, err = decoder.Token(); err != io.EOF {
		return nil, errors.New("trailing JSON")
	}
	return value, nil
}

func validSurrogates(raw string) bool {
	quoted := false
	for i := 0; i < len(raw); i++ {
		if raw[i] == '"' {
			quoted = !quoted
			continue
		}
		if !quoted || raw[i] != '\\' {
			continue
		}
		i++
		if i >= len(raw) {
			return false
		}
		if raw[i] != 'u' {
			continue
		}
		if i+4 >= len(raw) {
			return false
		}
		u, err := strconv.ParseUint(raw[i+1:i+5], 16, 16)
		if err != nil {
			return false
		}
		i += 4
		if u >= 0xDC00 && u <= 0xDFFF {
			return false
		}
		if u < 0xD800 || u > 0xDBFF {
			continue
		}
		if i+6 >= len(raw) || raw[i+1:i+3] != `\u` {
			return false
		}
		low, err := strconv.ParseUint(raw[i+3:i+7], 16, 16)
		if err != nil || low < 0xDC00 || low > 0xDFFF {
			return false
		}
		i += 6
	}
	return true
}

// Encode orders keys by Unicode code point (UTF-8 byte order is equivalent for
// valid Unicode) and escapes only JSON controls, quotation marks and backslash.
func Encode(value any) string {
	var out strings.Builder
	var write func(any)
	write = func(v any) {
		switch x := v.(type) {
		case nil:
			out.WriteString("null")
		case bool:
			out.WriteString(strconv.FormatBool(x))
		case string:
			writeString(&out, x)
		case json.Number:
			out.WriteString(string(x))
		case map[string]any:
			keys := make([]string, 0, len(x))
			for key := range x {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			out.WriteByte('{')
			for i, key := range keys {
				if i > 0 {
					out.WriteByte(',')
				}
				writeString(&out, key)
				out.WriteByte(':')
				write(x[key])
			}
			out.WriteByte('}')
		case []any:
			out.WriteByte('[')
			for i, child := range x {
				if i > 0 {
					out.WriteByte(',')
				}
				write(child)
			}
			out.WriteByte(']')
		default:
			b, _ := json.Marshal(x)
			parsed, err := Parse(string(b), false)
			if err != nil {
				out.WriteString("null")
			} else {
				write(parsed)
			}
		}
	}
	write(value)
	return out.String()
}

func writeString(out *strings.Builder, s string) {
	out.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			out.WriteString(`\"`)
		case '\\':
			out.WriteString(`\\`)
		case '\b':
			out.WriteString(`\b`)
		case '\f':
			out.WriteString(`\f`)
		case '\n':
			out.WriteString(`\n`)
		case '\r':
			out.WriteString(`\r`)
		case '\t':
			out.WriteString(`\t`)
		default:
			if r < 0x20 {
				out.WriteString(`\u00`)
				out.WriteByte("0123456789abcdef"[r>>4])
				out.WriteByte("0123456789abcdef"[r&15])
			} else {
				out.WriteRune(r)
			}
		}
	}
	out.WriteByte('"')
}
