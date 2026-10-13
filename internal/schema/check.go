// Package schema applies the production, bounded JSON Schema profile.
package schema

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mcp-studio/internal/jsonnumber"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"github.com/santhosh-tekuri/jsonschema/v6/kind"
)

type Issue struct {
	Path string `json:"path"`
	Code string `json:"code"`
}

type Result struct {
	Supported bool    `json:"supported"`
	Valid     bool    `json:"valid"`
	Errors    []Issue `json:"errors"`
	Reason    string  `json:"reason,omitempty"`
}

const (
	maxBytes    = 1 << 20
	maxDepth    = 64
	maxNodes    = 4096
	resourceURL = "https://mcp-studio.invalid/schema"
)

// Check compiles the declared 2020-12/default or draft-07 profile with the
// formal validator. Resources are confined to this document; even accidental
// future profile gaps cannot cause a network or filesystem load.
func Check(schemaJSON, valueJSON string) Result {
	doc, err := decodeBounded(schemaJSON)
	if err != nil {
		return unsupported("invalid_schema_json_or_limit")
	}
	p := profile{resources: map[string]bool{resourceURL: true}}
	base, _ := url.Parse(resourceURL)
	if err := p.walk(doc, base, "2020"); err != nil {
		return unsupported("unsupported_schema_profile")
	}
	for _, ref := range p.refs {
		if !p.resources[ref] {
			return unsupported("external_reference")
		}
	}
	c := jsonschema.NewCompiler()
	c.DefaultDraft(jsonschema.Draft2020)
	c.UseLoader(denyLoader{})
	if err := c.AddResource(resourceURL, doc); err != nil {
		return unsupported("invalid_schema")
	}
	compiled, err := c.Compile(resourceURL)
	if err != nil {
		return unsupported("invalid_schema")
	}
	value, err := decodeBounded(valueJSON)
	if err != nil {
		return Result{Supported: true, Errors: []Issue{{Code: "json"}}, Reason: "invalid_json_or_limit"}
	}
	if !withinEvaluationBudget(compiled, value) {
		return unsupported("schema_evaluation_limit")
	}
	if err := compiled.Validate(value); err != nil {
		var validation *jsonschema.ValidationError
		if !errors.As(err, &validation) {
			return Result{Supported: true, Errors: []Issue{{Code: "validation"}}}
		}
		issues := []Issue{}
		collectIssues(validation, value, &issues)
		sort.Slice(issues, func(i, j int) bool {
			if issues[i].Path == issues[j].Path {
				return issues[i].Code < issues[j].Code
			}
			return issues[i].Path < issues[j].Path
		})
		unique := issues[:0]
		for _, issue := range issues {
			if len(unique) == 0 || unique[len(unique)-1] != issue {
				unique = append(unique, issue)
			}
		}
		return Result{Supported: true, Errors: unique}
	}
	return Result{Supported: true, Valid: true, Errors: []Issue{}}
}

// Bound same-instance reference/applicator fan-out before entering the library.
// Structural recursion is allowed because its progress is bounded by the JSON
// depth and node limits. No timed-out validation goroutine is left running.
func withinEvaluationBudget(root *jsonschema.Schema, value any) bool {
	const limit = 100000
	memo := map[*jsonschema.Schema]int{}
	active := map[*jsonschema.Schema]bool{}
	var cost func(*jsonschema.Schema) int
	cost = func(s *jsonschema.Schema) int {
		if s == nil {
			return 0
		}
		if n, ok := memo[s]; ok {
			return n
		}
		if active[s] {
			return limit + 1
		}
		active[s] = true
		n := 1
		for _, child := range sameInstanceChildren(s) {
			n += cost(child)
			if n > limit {
				break
			}
		}
		delete(active, s)
		memo[s] = n
		return n
	}
	seen := map[*jsonschema.Schema]bool{}
	queue := []*jsonschema.Schema{root}
	maxCost := 1
	for len(queue) > 0 {
		s := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		if s == nil || seen[s] {
			continue
		}
		seen[s] = true
		n := cost(s)
		if n > limit {
			return false
		}
		if n > maxCost {
			maxCost = n
		}
		queue = append(queue, sameInstanceChildren(s)...)
		queue = append(queue, structuralChildren(s)...)
	}
	nodes := 0
	var count func(any)
	count = func(v any) {
		nodes++
		switch v := v.(type) {
		case map[string]any:
			for _, child := range v {
				count(child)
			}
		case []any:
			for _, child := range v {
				count(child)
			}
		}
	}
	count(value)
	return maxCost <= limit/nodes
}

func sameInstanceChildren(s *jsonschema.Schema) []*jsonschema.Schema {
	children := []*jsonschema.Schema{s.Ref, s.RecursiveRef, s.Not, s.If, s.Then, s.Else}
	if s.DynamicRef != nil {
		children = append(children, s.DynamicRef.Ref)
	}
	children = append(children, s.AllOf...)
	children = append(children, s.AnyOf...)
	children = append(children, s.OneOf...)
	for _, child := range s.DependentSchemas {
		children = append(children, child)
	}
	for _, dependency := range s.Dependencies {
		if child, ok := dependency.(*jsonschema.Schema); ok {
			children = append(children, child)
		}
	}
	return children
}

func structuralChildren(s *jsonschema.Schema) []*jsonschema.Schema {
	children := []*jsonschema.Schema{s.PropertyNames, s.UnevaluatedProperties, s.Contains, s.Items2020, s.UnevaluatedItems}
	children = append(children, s.PrefixItems...)
	for _, child := range s.Properties {
		children = append(children, child)
	}
	for _, child := range s.PatternProperties {
		children = append(children, child)
	}
	for _, v := range []any{s.AdditionalProperties, s.AdditionalItems, s.Items} {
		switch child := v.(type) {
		case *jsonschema.Schema:
			children = append(children, child)
		case []*jsonschema.Schema:
			children = append(children, child...)
		}
	}
	return children
}

func unsupported(reason string) Result { return Result{Errors: []Issue{}, Reason: reason} }

type denyLoader struct{}

func (denyLoader) Load(string) (any, error) {
	return nil, errors.New("external schema resources are disabled")
}

func decodeBounded(raw string) (any, error) {
	if len(raw) > maxBytes {
		return nil, errors.New("size limit")
	}
	dec := json.NewDecoder(strings.NewReader(raw))
	dec.UseNumber()
	var value any
	if err := dec.Decode(&value); err != nil {
		return nil, err
	}
	var trailing any
	if err := dec.Decode(&trailing); err != io.EOF {
		return nil, errors.New("trailing JSON")
	}
	if number, ok := value.(json.Number); ok {
		normalized, err := jsonnumber.Normalize(string(number))
		if err != nil {
			return nil, err
		}
		value = normalized
	}
	nodes := 0
	var visit func(any, int) error
	visit = func(v any, depth int) error {
		nodes++
		if nodes > maxNodes || depth > maxDepth {
			return errors.New("complexity limit")
		}
		switch x := v.(type) {
		case map[string]any:
			for key, child := range x {
				if number, ok := child.(json.Number); ok {
					normalized, err := jsonnumber.Normalize(string(number))
					if err != nil {
						return err
					}
					x[key] = normalized
				}
				if err := visit(x[key], depth+1); err != nil {
					return err
				}
			}
		case []any:
			for index, child := range x {
				if number, ok := child.(json.Number); ok {
					normalized, err := jsonnumber.Normalize(string(number))
					if err != nil {
						return err
					}
					x[index] = normalized
				}
				if err := visit(x[index], depth+1); err != nil {
					return err
				}
			}
		}
		return nil
	}
	if err := visit(value, 0); err != nil {
		return nil, err
	}
	return value, nil
}

type profile struct {
	resources map[string]bool
	refs      []string
}

var commonKeywords = words(`$schema $id $ref $comment title description default examples readOnly writeOnly deprecated definitions type enum const multipleOf maximum exclusiveMaximum minimum exclusiveMinimum maxLength minLength pattern maxItems minItems uniqueItems contains maxProperties minProperties required properties patternProperties additionalProperties propertyNames allOf anyOf oneOf not if then else format contentEncoding contentMediaType`)
var draft2020Keywords = words(`$defs $anchor $dynamicAnchor $dynamicRef $vocabulary prefixItems items minContains maxContains dependentSchemas dependentRequired unevaluatedItems unevaluatedProperties contentSchema`)
var draft07Keywords = words(`definitions items additionalItems dependencies`)
var schemaMaps = words(`$defs definitions properties patternProperties dependentSchemas`)
var schemaLists = words(`allOf anyOf oneOf prefixItems`)
var schemaSingles = words(`additionalProperties additionalItems unevaluatedItems unevaluatedProperties contains propertyNames not if then else contentSchema`)
var formats = words(`date-time date time duration email idn-email hostname idn-hostname ipv4 ipv6 uri uri-reference iri iri-reference uuid uri-template json-pointer relative-json-pointer regex`)

func words(s string) map[string]bool {
	result := map[string]bool{}
	for _, word := range strings.Fields(s) {
		result[word] = true
	}
	return result
}

func (p *profile) walk(v any, base *url.URL, draft string) error {
	if _, ok := v.(bool); ok {
		return nil
	}
	m, ok := v.(map[string]any)
	if !ok {
		return errors.New("schema must be object or boolean")
	}
	if declared, exists := m["$schema"]; exists {
		switch declared {
		case "https://json-schema.org/draft/2020-12/schema":
			draft = "2020"
		case "http://json-schema.org/draft-07/schema#", "http://json-schema.org/draft-07/schema":
			draft = "07"
		default:
			return errors.New("unsupported dialect")
		}
	}
	if id, exists := m["$id"]; exists {
		s, ok := id.(string)
		if !ok {
			return errors.New("invalid id")
		}
		u, err := base.Parse(s)
		if err != nil {
			return err
		}
		base = u
		resource := *u
		resource.Fragment = ""
		p.resources[resource.String()] = true
	}
	for key, val := range m {
		if !commonKeywords[key] && !(draft == "2020" && draft2020Keywords[key]) && !(draft == "07" && draft07Keywords[key]) {
			return fmt.Errorf("unknown schema keyword")
		}
		switch key {
		case "$ref", "$dynamicRef":
			s, ok := val.(string)
			if !ok {
				return errors.New("invalid ref")
			}
			resolved, err := base.Parse(s)
			if err != nil {
				return err
			}
			resolved.Fragment = ""
			p.refs = append(p.refs, resolved.String())
		case "$vocabulary":
			vocab, ok := val.(map[string]any)
			if !ok {
				return errors.New("invalid vocabulary")
			}
			for uri := range vocab {
				if !strings.HasPrefix(uri, "https://json-schema.org/draft/2020-12/vocab/") || !words("core applicator unevaluated validation meta-data format-annotation content")[strings.TrimPrefix(uri, "https://json-schema.org/draft/2020-12/vocab/")] {
					return errors.New("unsupported vocabulary")
				}
			}
		case "format":
			s, ok := val.(string)
			if !ok || !formats[s] {
				return errors.New("unsupported format")
			}
			// draft-07 normally asserts format. The shared product contract treats
			// recognized formats as annotations consistently in both dialects.
			delete(m, "format")
		case "pattern":
			s, ok := val.(string)
			if !ok || !portablePattern(s) {
				return errors.New("unsupported pattern")
			}
		}
		if schemaMaps[key] {
			children, ok := val.(map[string]any)
			if !ok {
				return errors.New("invalid schema map")
			}
			for pattern, child := range children {
				if key == "patternProperties" && !portablePattern(pattern) {
					return errors.New("unsupported pattern")
				}
				if err := p.walk(child, base, draft); err != nil {
					return err
				}
			}
		} else if schemaLists[key] {
			children, ok := val.([]any)
			if !ok {
				return errors.New("invalid schema list")
			}
			for _, child := range children {
				if err := p.walk(child, base, draft); err != nil {
					return err
				}
			}
		} else if schemaSingles[key] {
			if err := p.walk(val, base, draft); err != nil {
				return err
			}
		} else if key == "items" {
			if children, ok := val.([]any); ok {
				if draft != "07" {
					return errors.New("tuple items unsupported for 2020")
				}
				for _, child := range children {
					if err := p.walk(child, base, draft); err != nil {
						return err
					}
				}
			} else if err := p.walk(val, base, draft); err != nil {
				return err
			}
		} else if key == "dependencies" {
			children, ok := val.(map[string]any)
			if !ok {
				return errors.New("invalid dependencies")
			}
			for _, child := range children {
				if _, array := child.([]any); !array {
					if err := p.walk(child, base, draft); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

func portablePattern(pattern string) bool {
	if len(pattern) > 256 || strings.Contains(pattern, "(?") || strings.Contains(pattern, "[[:") {
		return false
	}
	for i := 0; i < len(pattern); i++ {
		if pattern[i] != '\\' {
			continue
		}
		i++
		if i >= len(pattern) {
			return false
		}
		if strings.ContainsRune("123456789pPkKcCxXuUAzZQEGsS", rune(pattern[i])) {
			return false
		}
	}
	inClass := false
	for i := 0; i < len(pattern); i++ {
		if pattern[i] == '\\' {
			i++
			continue
		}
		if pattern[i] == '[' {
			inClass = true
		}
		if pattern[i] == ']' {
			inClass = false
		}
		if pattern[i] == '.' && !inClass {
			return false
		}
	}
	_, err := regexp.Compile(pattern)
	return err == nil
}

func pointer(parts []string) string {
	out := ""
	for _, part := range parts {
		out += "/" + strings.ReplaceAll(strings.ReplaceAll(part, "~", "~0"), "/", "~1")
	}
	return out
}

func collectIssues(e *jsonschema.ValidationError, value any, issues *[]Issue) {
	path := pointer(e.InstanceLocation)
	add := func(p, code string) { *issues = append(*issues, Issue{p, code}) }
	switch k := e.ErrorKind.(type) {
	case *kind.AdditionalItems:
		array, ok := valueAt(value, e.InstanceLocation).([]any)
		if ok {
			for i := len(array) - k.Count; i < len(array); i++ {
				add(path+"/"+strconv.Itoa(i), "additionalItems")
			}
		}
		return
	case *kind.Required:
		for _, name := range k.Missing {
			add(path+pointer([]string{name}), "required")
		}
		return
	case *kind.DependentRequired:
		for _, name := range k.Missing {
			add(path+pointer([]string{name}), "dependentRequired")
		}
		return
	case *kind.Dependency:
		for _, name := range k.Missing {
			add(path+pointer([]string{name}), "dependencies")
		}
		return
	case *kind.AdditionalProperties:
		for _, name := range k.Properties {
			add(path+pointer([]string{name}), "additionalProperties")
		}
		return
	case *kind.AnyOf:
		add(path, "anyOf")
		return
	case *kind.OneOf:
		add(path, "oneOf")
		return
	case *kind.FalseSchema:
		add(path, "falseSchema")
		return
	}
	if len(e.Causes) > 0 {
		for _, cause := range e.Causes {
			collectIssues(cause, value, issues)
		}
		return
	}
	keyword := e.ErrorKind.KeywordPath()
	if len(keyword) > 0 {
		add(path, keyword[0])
	} else {
		add(path, "validation")
	}
}

func valueAt(value any, parts []string) any {
	for _, part := range parts {
		switch v := value.(type) {
		case map[string]any:
			value = v[part]
		case []any:
			i, err := strconv.Atoi(part)
			if err != nil || i < 0 || i >= len(v) {
				return nil
			}
			value = v[i]
		default:
			return nil
		}
	}
	return value
}
