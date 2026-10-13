package recording

import (
	"encoding/json"
	"errors"
	"mcp-studio/internal/jsonnumber"
	"mcp-studio/internal/wire"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

type Options struct {
	SecretValues                        []string
	ProjectPointers, AdditionalPointers []string
}
type Result struct {
	Value   any
	Markers []wire.RedactionMarker
	Omitted bool
}

var sensitiveKey = regexp.MustCompile(`(?i)(authorization|credential|api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|cookie|email|phone)`)
var sensitiveText = regexp.MustCompile(`(?i)(bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{8,}|[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}|(?:\+?[0-9][0-9 -]{8,}[0-9]))`)

func redacted() map[string]any { return map[string]any{"$redacted": true} }
func isMarker(v any) bool {
	m, ok := v.(map[string]any)
	return ok && len(m) == 1 && m["$redacted"] == true
}

// Redact clones the value; the raw debug value never becomes the upload buffer.
func Redact(value any, options Options) (Result, error) {
	result := Result{Markers: []wire.RedactionMarker{}}
	pointers := map[string]string{}
	for _, pointer := range options.ProjectPointers {
		parts, err := Pointer(pointer)
		if err != nil {
			return result, err
		}
		if _, ok := at(value, parts); ok {
			pointers[pointer] = "project"
		}
	}
	for _, pointer := range options.AdditionalPointers {
		parts, err := Pointer(pointer)
		if err != nil {
			return result, err
		}
		if _, ok := at(value, parts); !ok {
			return result, errors.New("invalid_pointer")
		}
		pointers[pointer] = "additional"
	}
	secrets := append([]string{}, options.SecretValues...)
	source := func(v any) { secrets = append(secrets, StringLeaves(v)...) }
	nodes := 0
	var gather func(any, int) bool
	gather = func(v any, depth int) bool {
		nodes++
		if depth > 64 || nodes > 4096 {
			return false
		}
		switch x := v.(type) {
		case map[string]any:
			for key, child := range x {
				if sensitiveKey.MatchString(key) {
					source(child)
				}
				if !gather(child, depth+1) {
					return false
				}
			}
		case []any:
			for _, child := range x {
				if !gather(child, depth+1) {
					return false
				}
			}
		}
		return true
	}
	if !gather(value, 0) {
		return Result{Value: redacted(), Markers: []wire.RedactionMarker{{Path: "", Reason: "omitted"}}, Omitted: true}, nil
	}
	for pointer := range pointers {
		parts, _ := Pointer(pointer)
		v, _ := at(value, parts)
		source(v)
	}
	containsSource := func(s string) bool {
		for _, secret := range secrets {
			if secret != "" && strings.Contains(s, secret) {
				return true
			}
		}
		return false
	}
	mark := func(path, reason string) any {
		result.Markers = append(result.Markers, wire.RedactionMarker{Path: path, Reason: reason})
		return redacted()
	}
	var walk func(any, string) any
	walk = func(v any, path string) any {
		if reason, ok := pointers[path]; ok {
			return mark(path, reason)
		}
		if isMarker(v) {
			return mark(path, "source")
		}
		switch x := v.(type) {
		case string:
			if containsSource(x) {
				return mark(path, "source")
			}
			if sensitiveText.MatchString(x) || secretURL(x) {
				return mark(path, "default")
			}
			return x
		case map[string]any:
			if typ, _ := x["type"].(string); typ == "image" || typ == "audio" || x["blob"] != nil {
				result.Markers = append(result.Markers, wire.RedactionMarker{Path: path, Reason: "omitted"})
				metadata := map[string]any{"omitted": "binary_content"}
				for _, key := range []string{"type", "mimeType"} {
					if text, ok := x[key].(string); ok && !containsSource(text) && !sensitiveText.MatchString(text) {
						metadata[key] = text
					}
				}
				return metadata
			}
			for key := range x {
				if containsSource(key) {
					return mark(path, "source")
				}
			}
			out := map[string]any{}
			for key, child := range x {
				childPath := path + "/" + escape(key)
				if sensitiveKey.MatchString(key) {
					out[key] = mark(childPath, "default")
				} else {
					out[key] = walk(child, childPath)
				}
			}
			return out
		case []any:
			out := make([]any, len(x))
			for i, child := range x {
				out[i] = walk(child, path+"/"+strconv.Itoa(i))
			}
			return out
		case json.Number, float64, float32, int, int64, bool:
			if text, ok := sourceScalar(x); ok && containsSource(text) {
				return mark(path, "source")
			}
			return x
		default:
			return x
		}
	}
	result.Value = walk(value, "")
	sort.Slice(result.Markers, func(i, j int) bool { return result.Markers[i].Path < result.Markers[j].Path })
	return result, nil
}

func secretURL(s string) bool {
	u, err := url.Parse(s)
	if err != nil || u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	if u.User != nil {
		return true
	}
	for key := range u.Query() {
		if sensitiveKey.MatchString(key) {
			return true
		}
	}
	return false
}
func escape(s string) string { return strings.ReplaceAll(strings.ReplaceAll(s, "~", "~0"), "/", "~1") }

// Pointer validates RFC6901 escapes and leaves array bounds to the actual value.
func Pointer(pointer string) ([]string, error) {
	if pointer == "" {
		return []string{}, nil
	}
	if !strings.HasPrefix(pointer, "/") {
		return nil, errors.New("invalid_pointer")
	}
	parts := strings.Split(pointer[1:], "/")
	for i, part := range parts {
		for j := 0; j < len(part); j++ {
			if part[j] == '~' {
				j++
				if j >= len(part) || part[j] != '0' && part[j] != '1' {
					return nil, errors.New("invalid_pointer")
				}
			}
		}
		parts[i] = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
	}
	return parts, nil
}
func at(value any, parts []string) (any, bool) {
	for _, part := range parts {
		switch x := value.(type) {
		case map[string]any:
			var ok bool
			value, ok = x[part]
			if !ok {
				return nil, false
			}
		case []any:
			i, err := strconv.Atoi(part)
			if err != nil || strconv.Itoa(i) != part || i < 0 || i >= len(x) {
				return nil, false
			}
			value = x[i]
		default:
			return nil, false
		}
	}
	return value, true
}

func RestoreRequest(value any, markers []wire.RedactionMarker) any {
	object, ok := value.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	remove := map[string]bool{}
	for _, marker := range markers {
		path := marker.Path
		if strings.HasPrefix(path, "/request/") {
			path = strings.TrimPrefix(path, "/request")
		}
		if path == "" || path == "/request" {
			return map[string]any{}
		}
		parts, err := Pointer(path)
		if err == nil && len(parts) > 0 {
			remove[parts[0]] = true
		}
	}
	var masked func(any) bool
	masked = func(v any) bool {
		if isMarker(v) {
			return true
		}
		switch x := v.(type) {
		case map[string]any:
			if x["omitted"] == "binary_content" {
				return true
			}
			for _, child := range x {
				if masked(child) {
					return true
				}
			}
		case []any:
			for _, child := range x {
				if masked(child) {
					return true
				}
			}
		}
		return false
	}
	result := map[string]any{}
	for key, child := range object {
		if !remove[key] && !masked(child) {
			result[key] = child
		}
	}
	return result
}

func ValueAt(value any, parts []string) (any, bool) { return at(value, parts) }
func StringLeaves(value any) []string {
	out := []string{}
	var visit func(any)
	visit = func(v any) {
		if isMarker(v) {
			return
		}
		switch x := v.(type) {
		case map[string]any:
			for key, child := range x {
				if key != "" {
					out = append(out, key)
				}
				visit(child)
			}
		case []any:
			for _, child := range x {
				visit(child)
			}
		default:
			if text, ok := sourceScalar(x); ok && text != "" {
				out = append(out, text)
			}
		}
	}
	visit(value)
	return out
}
func sourceScalar(value any) (string, bool) {
	switch x := value.(type) {
	case string:
		return x, true
	case bool:
		return strconv.FormatBool(x), true
	case json.Number:
		normalized, err := jsonnumber.Normalize(string(x))
		return string(normalized), err == nil
	case float64:
		normalized, err := jsonnumber.Normalize(strconv.FormatFloat(x, 'g', -1, 64))
		return string(normalized), err == nil
	case float32:
		normalized, err := jsonnumber.Normalize(strconv.FormatFloat(float64(x), 'g', -1, 64))
		return string(normalized), err == nil
	case int:
		return strconv.Itoa(x), true
	case int64:
		return strconv.FormatInt(x, 10), true
	default:
		return "", false
	}
}

func IsMarker(value any) bool { return isMarker(value) }

// SensitiveValues collects source labels before masking so associated display
// metadata and schema annotations can reuse the same source suppression.
func SensitiveValues(value any, options Options) []string {
	result := append([]string{}, options.SecretValues...)
	var visit func(any)
	visit = func(v any) {
		if isMarker(v) {
			return
		}
		switch x := v.(type) {
		case map[string]any:
			for key, child := range x {
				if sensitiveKey.MatchString(key) {
					result = append(result, StringLeaves(child)...)
				}
				visit(child)
			}
		case []any:
			for _, child := range x {
				visit(child)
			}
		}
	}
	visit(value)
	for _, pointer := range append(append([]string{}, options.ProjectPointers...), options.AdditionalPointers...) {
		parts, err := Pointer(pointer)
		if err == nil {
			if v, ok := at(value, parts); ok {
				result = append(result, StringLeaves(v)...)
			}
		}
	}
	return result
}
func SensitiveName(name string) bool { return sensitiveKey.MatchString(name) }
