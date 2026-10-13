// Package environment resolves the current project's public definitions and explicitly
// supplied personal values. Result.Rows is safe to display; Read is private execution data.
package environment

import (
	"encoding/json"
	"math"
	"mcp-studio/internal/wire"
	"regexp"
	"sort"
	"strings"
)

type Definition struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Value     any    `json:"value"`
	Sensitive bool   `json:"sensitive"`
	Required  bool   `json:"required"`
}
type Layer struct {
	Source      string       `json:"source"`
	Definitions []Definition `json:"definitions"`
}
type Input struct {
	Layers   []Layer        `json:"layers"`
	Personal map[string]any `json:"personal"`
	Targets  []string       `json:"targets"`
}
type Row struct {
	Name      string  `json:"name"`
	Status    string  `json:"status"`
	Source    *string `json:"source"`
	Sensitive bool    `json:"sensitive"`
	Value     any     `json:"-"`
}

func (r Row) MarshalJSON() ([]byte, error) {
	m := map[string]any{"name": r.Name, "status": r.Status, "source": r.Source, "sensitive": r.Sensitive}
	if !r.Sensitive && r.Status == "resolved" {
		m["value"] = r.Value
	}
	return json.Marshal(m)
}

type PrivateValue struct {
	Value     any
	Sensitive bool
}
type Result struct {
	Rows    []Row
	Error   string
	private map[string]PrivateValue
}

func (r Result) Read(name string) (PrivateValue, bool) {
	value, ok := r.private[name]
	return value, ok
}

var Reference = regexp.MustCompile(`\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}`)

func Empty(value any) bool {
	if value == nil {
		return true
	}
	s, ok := value.(string)
	return ok && strings.TrimSpace(s) == ""
}
func Resolve(input Input) Result {
	result := Result{Rows: []Row{}, private: map[string]PrivateValue{}}
	type entry struct {
		definition Definition
		source     string
	}
	effective := map[string]entry{}
	count := 0
	for _, layer := range input.Layers {
		seen := map[string]bool{}
		for _, def := range layer.Definitions {
			count++
			if count > 256 {
				result.Error = "resolution_limit"
				return result
			}
			if seen[def.Name] {
				result.Error = "duplicate_definition"
				return result
			}
			seen[def.Name] = true
			effective[def.Name] = entry{def, layer.Source}
		}
	}
	steps := 0
	memo := map[string]Row{}
	var resolve func(string, map[string]bool) Row
	resolve = func(name string, active map[string]bool) Row {
		steps++
		if steps > 4096 {
			return Row{Name: name, Status: "resolution_limit"}
		}
		e, ok := effective[name]
		if !ok {
			return Row{Name: name, Status: "definition_missing"}
		}
		source := e.source
		d := e.definition
		r := Row{Name: name, Status: "resolved", Source: &source, Sensitive: d.Sensitive}
		if active[name] {
			r.Status = "cycle"
			return r
		}
		if cached, ok := memo[name]; ok {
			return cached
		}
		value := d.Value
		if d.Sensitive {
			var exists bool
			value, exists = input.Personal[d.ID]
			if !exists {
				r.Status = "personal_missing"
				return r
			}
		}
		active[name] = true
		defer delete(active, name)
		var replace func(any, int) any
		replace = func(value any, depth int) any {
			if depth > 64 {
				r.Status = "resolution_limit"
				return nil
			}
			switch v := value.(type) {
			case string:
				return Reference.ReplaceAllStringFunc(v, func(token string) string {
					dep := resolve(token[2:len(token)-2], active)
					r.Sensitive = r.Sensitive || dep.Sensitive
					if dep.Status != "resolved" {
						if dep.Status == "cycle" {
							r.Status = "cycle"
						} else {
							r.Status = "dependency_missing"
						}
					}
					if s, ok := dep.Value.(string); ok {
						return s
					}
					b, _ := json.Marshal(dep.Value)
					return string(b)
				})
			case []any:
				out := make([]any, len(v))
				for i, child := range v {
					out[i] = replace(child, depth+1)
				}
				return out
			case map[string]any:
				out := map[string]any{}
				for key, child := range v {
					out[key] = replace(child, depth+1)
				}
				return out
			}
			return value
		}
		r.Value = replace(value, 0)
		if r.Status == "resolved" && d.Required && Empty(r.Value) {
			r.Status = "required_empty"
		}
		if r.Status == "resolved" {
			valid := false
			switch d.Type {
			case "json":
				_, err := json.Marshal(r.Value)
				valid = err == nil
			case "string":
				_, valid = r.Value.(string)
			case "boolean":
				_, valid = r.Value.(bool)
			case "number":
				n, ok := r.Value.(float64)
				valid = ok && !math.IsNaN(n) && !math.IsInf(n, 0)
			}
			if !valid {
				r.Status = "type_error"
			}
		}
		// Cycles depend on the current stack. Cache only complete successful values.
		if r.Status == "resolved" {
			memo[name] = r
			result.private[name] = PrivateValue{r.Value, r.Sensitive}
		}
		return r
	}
	targets := input.Targets
	if targets == nil {
		for name := range effective {
			targets = append(targets, name)
		}
		sort.Strings(targets)
	}
	for _, name := range targets {
		r := resolve(name, map[string]bool{})
		safe := r
		if safe.Sensitive || safe.Status != "resolved" {
			safe.Value = nil
		}
		result.Rows = append(result.Rows, safe)
	}
	if steps > 4096 {
		result.Error = "resolution_limit"
		result.private = map[string]PrivateValue{}
	}
	return result
}

// BuildLayers selects only definitions from this project and the exact connection.
// Empty environment means base and must not duplicate the two base layers.
func BuildLayers(variables []wire.Variable, projectID, connectionID, environmentID string) []Layer {
	layers := []Layer{{Source: "base-project", Definitions: []Definition{}}, {Source: "environment-project", Definitions: []Definition{}}, {Source: "base-connection", Definitions: []Definition{}}, {Source: "environment-connection", Definitions: []Definition{}}}
	for _, v := range variables {
		if v.ProjectID != projectID || v.ConnectionID != "" && v.ConnectionID != connectionID || v.EnvironmentID != "" && v.EnvironmentID != environmentID {
			continue
		}
		index := 0
		if v.ConnectionID != "" {
			index = 2
		}
		if v.EnvironmentID != "" {
			index++
		}
		var value any
		if v.ValueJSON != "" {
			json.Unmarshal([]byte(v.ValueJSON), &value)
		}
		layers[index].Definitions = append(layers[index].Definitions, Definition{ID: v.ID, Name: v.Name, Type: v.Type, Value: value, Sensitive: v.Sensitive, Required: v.Required})
	}
	return layers
}
