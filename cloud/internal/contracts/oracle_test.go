package contracts

// All reference behavior lives in _test.go to prevent application reuse.
import (
	"encoding/json"
	"fmt"
	"math"
	"reflect"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

func object(v any) map[string]any { m, _ := v.(map[string]any); return m }
func list(v any) []any            { a, _ := v.([]any); return a }
func text(v any) string           { s, _ := v.(string); return s }
func yes(v any) bool              { b, _ := v.(bool); return b }
func escapePath(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "~", "~0"), "/", "~1")
}
func parts(pointer string) ([]string, bool) {
	if !strings.HasPrefix(pointer, "/") || regexp.MustCompile(`~([^01]|$)`).MatchString(pointer) {
		return nil, false
	}
	p := strings.Split(pointer[1:], "/")
	for i, s := range p {
		p[i] = strings.ReplaceAll(strings.ReplaceAll(s, "~1", "/"), "~0", "~")
	}
	return p, true
}
func at(value any, key string) (any, bool) {
	switch v := value.(type) {
	case map[string]any:
		r, ok := v[key]
		return r, ok
	case []any:
		i, e := strconv.Atoi(key)
		if e == nil && i >= 0 && i < len(v) {
			return v[i], true
		}
	}
	return nil, false
}
func pointerSet(value any, pointer string, replacement any, remove bool) bool {
	p, ok := parts(pointer)
	if !ok {
		return false
	}
	parent := value
	for _, key := range p[:len(p)-1] {
		parent, ok = at(parent, key)
		if !ok {
			return false
		}
	}
	key := p[len(p)-1]
	if _, ok = at(parent, key); !ok {
		return false
	}
	switch v := parent.(type) {
	case map[string]any:
		if remove {
			delete(v, key)
		} else {
			v[key] = replacement
		}
		return true
	case []any:
		i, _ := strconv.Atoi(key)
		if remove {
			return false
		}
		v[i] = replacement
		return true
	}
	return false
}
func copyValue(value any) any {
	b, _ := json.Marshal(value)
	var c any
	_ = json.Unmarshal(b, &c)
	return c
}
func empty(v any) bool {
	return v == nil || (reflect.TypeOf(v).Kind() == reflect.String && strings.TrimSpace(text(v)) == "")
}
func environment(input map[string]any) any {
	definitions := map[string]map[string]any{}
	for _, raw := range list(input["layers"]) {
		l := object(raw)
		seen := map[string]bool{}
		for _, rawD := range list(l["definitions"]) {
			d := object(copyValue(rawD))
			name := text(d["name"])
			if seen[name] {
				return map[string]any{"error": "duplicate_definition"}
			}
			seen[name] = true
			d["source"] = l["source"]
			definitions[name] = d
		}
	}
	type resolved struct {
		name, status string
		source       any
		sensitive    bool
		value        any
	}
	var resolve func(string, []string) resolved
	resolve = func(name string, stack []string) resolved {
		d, ok := definitions[name]
		r := resolved{name: name, status: "resolved", source: d["source"], sensitive: yes(d["sensitive"])}
		if !ok {
			r.status = "definition_missing"
			return r
		}
		for _, ancestor := range stack {
			if ancestor == name {
				r.status = "cycle"
				return r
			}
		}
		value := d["value"]
		if r.sensitive {
			var exists bool
			value, exists = object(input["personal"])[text(d["id"])]
			if !exists {
				r.status = "personal_missing"
				return r
			}
		}
		var replace func(any) any
		replace = func(v any) any {
			switch x := v.(type) {
			case string:
				return regexp.MustCompile(`\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}`).ReplaceAllStringFunc(x, func(token string) string {
					dep := resolve(token[2:len(token)-2], append(append([]string{}, stack...), name))
					r.sensitive = r.sensitive || dep.sensitive
					if dep.status != "resolved" {
						if dep.status == "cycle" {
							r.status = "cycle"
						} else {
							r.status = "dependency_missing"
						}
					}
					if s, ok := dep.value.(string); ok {
						return s
					}
					b, _ := json.Marshal(dep.value)
					return string(b)
				})
			case []any:
				a := make([]any, len(x))
				for i, child := range x {
					a[i] = replace(child)
				}
				return a
			case map[string]any:
				m := map[string]any{}
				for k, child := range x {
					m[k] = replace(child)
				}
				return m
			}
			return v
		}
		r.value = replace(value)
		if r.status == "resolved" && yes(d["required"]) && empty(r.value) {
			r.status = "required_empty"
		}
		if r.status == "resolved" {
			valid := false
			switch text(d["type"]) {
			case "json":
				valid = true
			case "string":
				_, valid = r.value.(string)
			case "boolean":
				_, valid = r.value.(bool)
			case "number":
				n, ok := r.value.(float64)
				valid = ok && !math.IsNaN(n) && !math.IsInf(n, 0)
			}
			if !valid {
				r.status = "type_error"
			}
		}
		return r
	}
	output := []any{}
	for _, raw := range list(input["targets"]) {
		r := resolve(text(raw), nil)
		m := map[string]any{"name": r.name, "status": r.status, "source": r.source, "sensitive": r.sensitive}
		if !r.sensitive && r.status == "resolved" {
			m["value"] = r.value
		}
		output = append(output, m)
	}
	return output
}

var supportedKeywords = map[string]bool{"$schema": true, "$ref": true, "$defs": true, "type": true, "properties": true, "required": true, "additionalProperties": true, "items": true, "minItems": true, "maxItems": true, "minLength": true, "maxLength": true, "minimum": true, "maximum": true, "enum": true, "const": true, "oneOf": true, "anyOf": true, "allOf": true, "title": true, "description": true, "default": true}

func localRef(root any, ref string) (any, bool) {
	if !strings.HasPrefix(ref, "#/") {
		return nil, false
	}
	p, ok := parts(ref[1:])
	if !ok {
		return nil, false
	}
	for _, key := range p {
		root, ok = at(root, key)
		if !ok {
			return nil, false
		}
	}
	return root, true
}
func schemaSupport(value, root any, stack []string) bool {
	if _, ok := value.(bool); ok {
		return true
	}
	s, ok := value.(map[string]any)
	if !ok {
		return false
	}
	for k := range s {
		if !supportedKeywords[k] {
			return false
		}
	}
	if uri, ok := s["$schema"]; ok && uri != "https://json-schema.org/draft/2020-12/schema" {
		return false
	}
	if raw, ok := s["$ref"]; ok {
		ref := text(raw)
		for _, prev := range stack {
			if prev == ref {
				return false
			}
		}
		target, ok := localRef(root, ref)
		if !ok || !schemaSupport(target, root, append(append([]string{}, stack...), ref)) {
			return false
		}
	}
	children := []any{}
	for _, key := range []string{"properties", "$defs"} {
		for _, child := range object(s[key]) {
			children = append(children, child)
		}
	}
	for _, key := range []string{"oneOf", "anyOf", "allOf"} {
		children = append(children, list(s[key])...)
	}
	if child, ok := s["items"]; ok {
		children = append(children, child)
	}
	if child, ok := s["additionalProperties"].(map[string]any); ok {
		children = append(children, child)
	}
	for _, child := range children {
		if !schemaSupport(child, root, stack) {
			return false
		}
	}
	return true
}
func typeMatches(kind string, value any) bool {
	switch kind {
	case "null":
		return value == nil
	case "object":
		_, ok := value.(map[string]any)
		return ok
	case "array":
		_, ok := value.([]any)
		return ok
	case "string":
		_, ok := value.(string)
		return ok
	case "boolean":
		_, ok := value.(bool)
		return ok
	case "number", "integer":
		n, ok := value.(float64)
		return ok && !math.IsInf(n, 0) && !math.IsNaN(n) && (kind == "number" || (n == math.Trunc(n) && math.Abs(n) <= 9007199254740991))
	}
	return false
}
func validateSchema(schema, value any, path string, root any) []string {
	errors := []string{}
	if b, ok := schema.(bool); ok {
		if !b {
			return []string{path + "#false"}
		}
		return errors
	}
	s := object(schema)
	if ref, ok := s["$ref"]; ok {
		target, _ := localRef(root, text(ref))
		errors = append(errors, validateSchema(target, value, path, root)...)
	}
	if raw, ok := s["type"]; ok {
		types := list(raw)
		if types == nil {
			types = []any{raw}
		}
		valid := false
		for _, kind := range types {
			valid = valid || typeMatches(text(kind), value)
		}
		if !valid {
			return append(errors, path+"#type")
		}
	}
	if raw, ok := s["enum"]; ok {
		found := false
		for _, candidate := range list(raw) {
			found = found || reflect.DeepEqual(candidate, value)
		}
		if !found {
			errors = append(errors, path+"#enum")
		}
	}
	if constant, ok := s["const"]; ok && !reflect.DeepEqual(constant, value) {
		errors = append(errors, path+"#const")
	}
	check := func(key string, actual float64, less bool) {
		if boundary, ok := s[key].(float64); ok && ((less && actual < boundary) || (!less && actual > boundary)) {
			errors = append(errors, path+"#"+key)
		}
	}
	switch v := value.(type) {
	case float64:
		check("minimum", v, true)
		check("maximum", v, false)
	case string:
		check("minLength", float64(utf8.RuneCountInString(v)), true)
		check("maxLength", float64(utf8.RuneCountInString(v)), false)
	case []any:
		check("minItems", float64(len(v)), true)
		check("maxItems", float64(len(v)), false)
		if child, ok := s["items"]; ok {
			for i, item := range v {
				errors = append(errors, validateSchema(child, item, fmt.Sprintf("%s/%d", path, i), root)...)
			}
		}
	case map[string]any:
		for _, raw := range list(s["required"]) {
			key := text(raw)
			if _, ok := v[key]; !ok {
				errors = append(errors, path+"/"+escapePath(key)+"#required")
			}
		}
		for key, item := range v {
			p := path + "/" + escapePath(key)
			if child, ok := object(s["properties"])[key]; ok {
				errors = append(errors, validateSchema(child, item, p, root)...)
			} else if s["additionalProperties"] == false {
				errors = append(errors, p+"#additionalProperties")
			} else if child, ok := s["additionalProperties"].(map[string]any); ok {
				errors = append(errors, validateSchema(child, item, p, root)...)
			}
		}
	}
	for _, keyword := range []string{"oneOf", "anyOf"} {
		if branches, ok := s[keyword]; ok {
			count := 0
			for _, child := range list(branches) {
				if len(validateSchema(child, value, path, root)) == 0 {
					count++
				}
			}
			if (keyword == "oneOf" && count != 1) || (keyword == "anyOf" && count == 0) {
				errors = append(errors, path+"#"+keyword)
			}
		}
	}
	for _, child := range list(s["allOf"]) {
		errors = append(errors, validateSchema(child, value, path, root)...)
	}
	unique := map[string]bool{}
	for _, e := range errors {
		unique[e] = true
	}
	errors = []string{}
	for e := range unique {
		errors = append(errors, e)
	}
	sort.Strings(errors)
	return errors
}
func schemaResult(input map[string]any) any {
	var value any
	status := "valid"
	errors := []string{}
	if json.Unmarshal([]byte(text(input["raw"])), &value) != nil {
		status = "invalid_json"
		errors = []string{"#json"}
	} else {
		for _, pointer := range list(input["skip"]) {
			pointerSet(value, text(pointer), nil, true)
		}
		if !schemaSupport(input["schema"], input["schema"], nil) {
			status = "unsupported_schema"
			errors = []string{"#unsupported"}
		} else {
			errors = validateSchema(input["schema"], value, "", input["schema"])
			if len(errors) > 0 {
				status = "schema_error"
			}
		}
	}
	return map[string]any{"status": status, "canExecute": status == "valid", "canSavePrivate": status != "invalid_json", "canPublish": status == "valid", "canStructure": status != "invalid_json", "errors": errors}
}
func redact(input map[string]any) any {
	if input["contentKind"] == "binary" || input["contentKind"] == "unparseable" {
		return map[string]any{"omitted": true, "reason": "unstructured_content"}
	}
	value := copyValue(input["value"])
	paths := map[string]bool{}
	for _, raw := range list(input["pointers"]) {
		pointer := text(raw)
		if !pointerSet(value, pointer, "[REDACTED]", false) {
			return map[string]any{"error": "invalid_pointer"}
		}
		paths[pointer] = true
	}
	secretKey := regexp.MustCompile(`(?i)^(authorization|proxy-authorization|cookie|set-cookie|token|access_token|refresh_token|api[_-]?key|password|secret|email|phone)$`)
	secretURL := regexp.MustCompile(`(?i)://[^\s/@:]+:[^\s/@]+@|[?&](token|api_key|key|access_token|password|secret)=`)
	var walk func(any, string, string) any
	walk = func(item any, path, key string) any {
		tainted := secretKey.MatchString(key)
		if s, ok := item.(string); ok {
			tainted = tainted || secretURL.MatchString(s)
		}
		for _, secret := range list(input["sensitiveValues"]) {
			if s, ok := item.(string); ok {
				if token, ok := secret.(string); ok && token != "" {
					tainted = tainted || strings.Contains(s, token)
					continue
				}
			}
			tainted = tainted || reflect.DeepEqual(item, secret)
		}
		if tainted {
			paths[path] = true
			return "[REDACTED]"
		}
		switch v := item.(type) {
		case []any:
			for i, child := range v {
				v[i] = walk(child, fmt.Sprintf("%s/%d", path, i), "")
			}
		case map[string]any:
			for k, child := range v {
				v[k] = walk(child, path+"/"+escapePath(k), k)
			}
		}
		return item
	}
	value = walk(value, "", "")
	p := []string{}
	for path := range paths {
		p = append(p, path)
	}
	sort.Strings(p)
	return map[string]any{"value": value, "paths": p, "omitted": false}
}
func evaluate(kind string, input map[string]any) any {
	switch kind {
	case "environment":
		return environment(input)
	case "schema":
		return schemaResult(input)
	case "redaction":
		return redact(input)
	case "run":
		status := text(input["start"])
		outcome := "unknown"
		for _, raw := range list(input["events"]) {
			if status != "running" {
				continue
			}
			switch text(raw) {
			case "cancel":
				status = "cancelled"
			case "timeout", "interrupted":
				status = "failed"
			case "success":
				status = "succeeded"
				outcome = "known"
			case "tool_error", "rpc_error", "unauthorized":
				status = "failed"
				outcome = "known"
			}
		}
		return map[string]any{"status": status, "remoteOutcome": outcome}
	case "upload":
		status := "accepted"
		if !yes(input["allowed"]) {
			status = "forbidden"
		} else if !yes(input["sameIdentity"]) {
			status = "identity_conflict"
		} else if input["storedDigest"] != nil {
			if input["storedDigest"] == input["incomingDigest"] {
				status = "idempotent"
			} else {
				status = "digest_conflict"
			}
		}
		return map[string]any{"status": status, "executeTool": false}
	case "permission":
		role := text(input["projectRole"])
		member := role == "maintainer" || role == "developer" || role == "viewer"
		writer := role == "maintainer" || role == "developer"
		allowed := false
		switch input["action"] {
		case "directory.read":
			allowed = input["teamRole"] == "owner" || input["teamRole"] == "admin" || member
		case "project.takeover":
			allowed = input["teamRole"] == "owner" && yes(input["self"])
		case "content.read":
			allowed = member
		case "private.read":
			allowed = member && yes(input["self"])
		case "upload.retry":
			allowed = writer && yes(input["self"]) && yes(input["held"])
		case "history.pin":
			allowed = role == "maintainer"
		}
		return map[string]any{"allowed": allowed}
	case "restore":
		if input["oldTabId"] == input["newTabId"] {
			return map[string]any{"error": "new_tab_required"}
		}
		var marked func(any) bool
		marked = func(v any) bool {
			if v == "[REDACTED]" || v == "[TRUNCATED]" {
				return true
			}
			for _, child := range object(v) {
				if marked(child) {
					return true
				}
			}
			for _, child := range list(v) {
				if marked(child) {
					return true
				}
			}
			return false
		}
		parameters := map[string]any{}
		removed := []string{}
		for key, value := range object(input["parameters"]) {
			if marked(value) {
				removed = append(removed, key)
			} else {
				parameters[key] = copyValue(value)
			}
		}
		sort.Strings(removed)
		return map[string]any{"tabId": input["newTabId"], "status": "unexecuted", "parameters": parameters, "removed": removed}
	}
	panic("unknown vector kind: " + kind)
}
