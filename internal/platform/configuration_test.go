//go:build !local

package platform

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/wire"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func configurationRequest(t *testing.T, a *App, method, path string, body any, s wire.Session, c *http.Cookie, etag string) *httptest.ResponseRecorder {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(method, path, strings.NewReader(string(b)))
	r.Header.Set("Origin", a.Config.Origin)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("X-CSRF-Token", s.Csrf)
	if etag != "" {
		r.Header.Set("If-Match", etag)
	}
	r.AddCookie(c)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	return w
}
func configurationData[T any](t *testing.T, w *httptest.ResponseRecorder, status int) T {
	t.Helper()
	if w.Code != status {
		t.Fatalf("status %d want %d: %s", w.Code, status, w.Body.String())
	}
	var envelope struct {
		Data T `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	return envelope.Data
}
func httpConfiguration(name string) wire.ConnectionInput {
	return wire.ConnectionInput{Name: name, Transport: "streamable-http", Channel: "browser", Endpoint: "http://localhost:9123/mcp?workspace=demo", Args: []string{}, Headers: []wire.ConfigEntry{}, Env: []wire.ConfigEntry{}, TimeoutMs: 30000, AuthMode: "none", OauthScopes: []string{}}
}
func TestConnectionIndependentIdentityConditionalPersistence(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Config")
	base := "/api/v1/projects/" + p.ID + "/connections"
	input := httpConfiguration("A")
	w := configurationRequest(t, a, "POST", base, input, s, c, "")
	first := configurationData[wire.Connection](t, w, 200)
	if first.ID == "" || first.ProjectID != p.ID || first.Version != 1 || first.Etag != w.Header().Get("ETag") || !strings.HasPrefix(first.Etag, `"`) || strings.HasPrefix(first.Etag, "W/") {
		t.Fatalf("invalid identity/version: %+v headers %v", first, w.Header())
	}
	input.Name = "B"
	second := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base, input, s, c, ""), 200)
	if first.ID == second.ID || first.Etag == second.Etag {
		t.Fatal("same URL merged identities or versions")
	}
	path := base + "/" + first.ID
	input.Name = "Changed"
	configurationData[any](t, configurationRequest(t, a, "PATCH", path, input, s, c, ""), 428)
	configurationData[any](t, configurationRequest(t, a, "PATCH", path, input, s, c, second.Etag), 409)
	updated := configurationData[wire.Connection](t, configurationRequest(t, a, "PATCH", path, input, s, c, first.Etag), 200)
	if updated.Version != 2 || updated.Etag == first.Etag {
		t.Fatalf("version did not advance: %+v", updated)
	}
	input.Name = "Stale overwrite"
	configurationData[any](t, configurationRequest(t, a, "PATCH", path, input, s, c, first.Etag), 409)
	read := configurationData[wire.Connection](t, configurationRequest(t, a, "GET", path, nil, s, c, ""), 200)
	if read.Name != "Changed" || read.Version != 2 {
		t.Fatalf("stale overwrite persisted: %+v", read)
	}
	items := configurationData[[]wire.Connection](t, configurationRequest(t, a, "GET", base, nil, s, c, ""), 200)
	if len(items) != 2 {
		t.Fatalf("list lost independent connection: %+v", items)
	}
	configurationData[any](t, configurationRequest(t, a, "DELETE", path, nil, s, c, ""), 428)
	configurationData[any](t, configurationRequest(t, a, "DELETE", path, nil, s, c, first.Etag), 409)
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", path, nil, s, c, updated.Etag), 200)
	configurationData[any](t, configurationRequest(t, a, "GET", path, nil, s, c, ""), 404)
	var count int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM connections WHERE project_id=$1`, p.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("delete persistence count=%d err=%v", count, err)
	}
}

func TestEnvironmentVariableLayersScopeAndSafeDeletion(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "A")
	q := createProject(t, a, s, c, "B")
	base := "/api/v1/projects/" + p.ID
	env := configurationData[wire.Environment](t, configurationRequest(t, a, "POST", base+"/environments", wire.EnvironmentInput{Name: " Production "}, s, c, ""), 200)
	if env.Name != "Production" || env.Version != 1 {
		t.Fatalf("environment %+v", env)
	}
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/environments", wire.EnvironmentInput{Name: "production"}, s, c, ""), 409)
	otherEnv := configurationData[wire.Environment](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+q.ID+"/environments", wire.EnvironmentInput{Name: "Production"}, s, c, ""), 200)
	input := httpConfiguration("Scoped")
	input.EnvironmentID = otherEnv.ID
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections", input, s, c, ""), 400)
	input.EnvironmentID = env.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", input, s, c, ""), 200)
	variable := wire.VariableInput{Name: "HOST", Type: "string", ValueJSON: `"base"`}
	vbase := configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", variable, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/variables", variable, s, c, ""), 409)
	configurationData[wire.Variable](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+q.ID+"/variables", variable, s, c, ""), 200)
	for _, layer := range []struct{ env, conn string }{{env.ID, ""}, {"", conn.ID}, {env.ID, conn.ID}} {
		variable.EnvironmentID = layer.env
		variable.ConnectionID = layer.conn
		configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", variable, s, c, ""), 200)
	}
	variable.Name = "FOREIGN"
	variable.EnvironmentID = otherEnv.ID
	variable.ConnectionID = ""
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/variables", variable, s, c, ""), 400)
	variable.EnvironmentID = ""
	variable.ConnectionID = "unknown-connection"
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/variables", variable, s, c, ""), 400)
	items := configurationData[[]wire.Variable](t, configurationRequest(t, a, "GET", base+"/variables", nil, s, c, ""), 200)
	if len(items) != 4 {
		t.Fatalf("four layers missing: %+v", items)
	}
	variable = wire.VariableInput{Name: "TOKEN", Type: "string", Sensitive: true, ValueJSON: `"plaintext-sentinel-DO-NOT-STORE"`}
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/variables", variable, s, c, ""), 400)
	variable.ValueJSON = ""
	sensitive := configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", variable, s, c, ""), 200)
	if sensitive.ValueJSON != "" {
		t.Fatal("sensitive definition leaked personal value")
	}
	variable = wire.VariableInput{Name: "HOST", Type: "string", ValueJSON: `"updated"`}
	path := base + "/variables/" + vbase.ID
	configurationData[any](t, configurationRequest(t, a, "PATCH", path, variable, s, c, ""), 428)
	changed := configurationData[wire.Variable](t, configurationRequest(t, a, "PATCH", path, variable, s, c, vbase.Etag), 200)
	configurationData[any](t, configurationRequest(t, a, "PATCH", path, variable, s, c, vbase.Etag), 409)
	if changed.Version != 2 {
		t.Fatalf("variable version %+v", changed)
	}
	read := configurationData[wire.Variable](t, configurationRequest(t, a, "GET", path, nil, s, c, ""), 200)
	if read.ValueJSON != `"updated"` {
		t.Fatalf("variable persistence %+v", read)
	}
	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/environments/"+env.ID, nil, s, c, env.Etag), 409)
	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/connections/"+conn.ID, nil, s, c, conn.Etag), 409)
	configurationData[any](t, configurationRequest(t, a, "DELETE", path, nil, s, c, vbase.Etag), 409)
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", path, nil, s, c, changed.Etag), 200)
	configurationData[any](t, configurationRequest(t, a, "GET", "/api/v1/projects/"+q.ID+"/variables/"+sensitive.ID, nil, s, c, ""), 404)
	envPath := base + "/environments/" + env.ID
	configurationData[any](t, configurationRequest(t, a, "PATCH", envPath, wire.EnvironmentInput{Name: "Staging"}, s, c, ""), 428)
	renamed := configurationData[wire.Environment](t, configurationRequest(t, a, "PATCH", envPath, wire.EnvironmentInput{Name: "Staging"}, s, c, env.Etag), 200)
	configurationData[any](t, configurationRequest(t, a, "PATCH", envPath, wire.EnvironmentInput{Name: "Overwrite"}, s, c, env.Etag), 409)
	if renamed.Version != 2 {
		t.Fatalf("environment version %+v", renamed)
	}
	envs := configurationData[[]wire.Environment](t, configurationRequest(t, a, "GET", base+"/environments", nil, s, c, ""), 200)
	if len(envs) != 1 || envs[0].Name != "Staging" {
		t.Fatalf("environment list %+v", envs)
	}
	unused := configurationData[wire.Environment](t, configurationRequest(t, a, "POST", base+"/environments", wire.EnvironmentInput{Name: "Unused"}, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/environments/"+unused.ID, nil, s, c, ""), 428)
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", base+"/environments/"+unused.ID, nil, s, c, unused.Etag), 200)
	var leaked int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM audits WHERE project_id=$1 AND (to_jsonb(audits)::text LIKE '%plaintext-sentinel%' OR to_jsonb(audits)::text LIKE '%workspace=demo%' OR to_jsonb(audits)::text LIKE '%valueJSON%')`, p.ID).Scan(&leaked); err != nil || leaked != 0 {
		t.Fatalf("audit config leak %d %v", leaked, err)
	}
}

func TestConfigurationPermissionsAndCurrentSessionAccess(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "A")
	q := createProject(t, a, s, c, "B")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("MCP"), s, c, ""), 200)
	for _, role := range []string{"admin", "developer", "viewer"} {
		email := role + "@example.test"
		teamRole := "member"
		if role == "admin" {
			teamRole = "admin"
		}
		uid := addUser(t, a, email, s.Teams[0].ID, teamRole)
		if role != "admin" {
			if _, err := a.DB.Exec(context.Background(), `INSERT INTO project_members VALUES($1,$2,$3)`, p.ID, uid, role); err != nil {
				t.Fatal(err)
			}
		}
		actor, cookie := login(t, a, email)
		readStatus := 200
		accessStatus := 403
		if role == "admin" {
			readStatus = 403
		}
		if role == "developer" {
			accessStatus = 200
		}
		for _, kind := range []string{"connections", "environments", "variables"} {
			configurationData[any](t, configurationRequest(t, a, "GET", base+"/"+kind, nil, actor, cookie, ""), readStatus)
			body := any(httpConfiguration("Denied"))
			if kind == "environments" {
				body = wire.EnvironmentInput{Name: "Denied"}
			}
			if kind == "variables" {
				body = wire.VariableInput{Name: "DENIED", Type: "string", ValueJSON: `"value"`}
			}
			configurationData[any](t, configurationRequest(t, a, "POST", base+"/"+kind, body, actor, cookie, ""), 403)
		}
		configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/connections/"+conn.ID, httpConfiguration("Denied"), actor, cookie, ""), 403)
		configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/connections/"+conn.ID, nil, actor, cookie, conn.Etag), 403)
		w := configurationRequest(t, a, "POST", base+"/connections/"+conn.ID+"/session-access", wire.ConnectionAccessRequest{Version: conn.Version}, actor, cookie, "")
		access := configurationData[wire.ConnectionAccess](t, w, accessStatus)
		if role == "developer" {
			if access.UserID != uid || access.ProjectID != p.ID || access.ConnectionID != conn.ID || access.Version != 1 || access.EnvironmentID != "" {
				t.Fatalf("access identity %+v", access)
			}
			a.DB.Exec(context.Background(), `UPDATE project_members SET role='viewer' WHERE project_id=$1 AND user_id=$2`, p.ID, uid)
			configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections/"+conn.ID+"/session-access", wire.ConnectionAccessRequest{Version: 1}, actor, cookie, ""), 403)
			a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, uid)
			configurationData[any](t, configurationRequest(t, a, "GET", base+"/connections/"+conn.ID, nil, actor, cookie, ""), 403)
		}
	}
	path := base + "/connections/" + conn.ID + "/session-access"
	configurationData[any](t, configurationRequest(t, a, "POST", path, wire.ConnectionAccessRequest{Version: 2}, s, c, ""), 409)
	configurationData[any](t, configurationRequest(t, a, "POST", path, wire.ConnectionAccessRequest{Version: 1, EnvironmentID: "foreign-or-deleted"}, s, c, ""), 400)
	configurationData[any](t, configurationRequest(t, a, "GET", "/api/v1/projects/"+q.ID+"/connections/"+conn.ID, nil, s, c, ""), 404)
	configurationData[any](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+q.ID+"/connections/"+conn.ID+"/session-access", wire.ConnectionAccessRequest{Version: 1}, s, c, ""), 404)
	a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, s.User.ID)
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/connections", nil, s, c, ""), 403)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("Denied owner"), s, c, ""), 403)
}

func TestConnectionAccessChecksUsedDefinitionsWithoutReceivingPersonalValues(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Definitions")
	base := "/api/v1/projects/" + p.ID
	input := httpConfiguration("Reference")
	input.Endpoint = "http://localhost:9123/{{HOST}}"
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", input, s, c, ""), 200)
	accessPath := base + "/connections/" + conn.ID + "/session-access"
	configurationData[any](t, configurationRequest(t, a, "POST", accessPath, wire.ConnectionAccessRequest{Version: 1}, s, c, ""), 400)
	host := configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", wire.VariableInput{Name: "HOST", Type: "string", ValueJSON: `"mcp"`}, s, c, ""), 200)
	configurationData[wire.ConnectionAccess](t, configurationRequest(t, a, "POST", accessPath, wire.ConnectionAccessRequest{Version: 1}, s, c, ""), 200)
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", base+"/variables/"+host.ID, nil, s, c, host.Etag), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", accessPath, wire.ConnectionAccessRequest{Version: 1}, s, c, ""), 400)
	dependent := configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", wire.VariableInput{Name: "HOST", Type: "string", ValueJSON: `"{{ABSENT}}"`}, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", accessPath, wire.ConnectionAccessRequest{Version: 1}, s, c, ""), 400)
	configurationData[wire.Variable](t, configurationRequest(t, a, "PATCH", base+"/variables/"+dependent.ID, wire.VariableInput{Name: "HOST", Type: "string", ValueJSON: `"{{HOST}}"`}, s, c, dependent.Etag), 200)
	w := configurationRequest(t, a, "POST", accessPath, wire.ConnectionAccessRequest{Version: 1}, s, c, "")
	configurationData[any](t, w, 400)
	if !strings.Contains(w.Body.String(), `"cycle"`) {
		t.Fatalf("cycle diagnostic missing %s", w.Body.String())
	}
	token := configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", wire.VariableInput{Name: "TOKEN", Type: "string", Sensitive: true}, s, c, ""), 200)
	input.Endpoint = "http://localhost:9123/mcp"
	input.Headers = []wire.ConfigEntry{{Name: "Authorization", Value: "Bearer {{TOKEN}}"}}
	input.AuthMode = "reference"
	input.AuthReferenceID = token.ID
	updated := configurationData[wire.Connection](t, configurationRequest(t, a, "PATCH", base+"/connections/"+conn.ID, input, s, c, conn.Etag), 200)
	configurationData[wire.ConnectionAccess](t, configurationRequest(t, a, "POST", accessPath, wire.ConnectionAccessRequest{Version: updated.Version}, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", accessPath, map[string]any{"version": updated.Version, "environmentId": "", "token": "never-accept-personal-value"}, s, c, ""), 400)
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", base+"/variables/"+token.ID, nil, s, c, token.Etag), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", accessPath, wire.ConnectionAccessRequest{Version: updated.Version}, s, c, ""), 400)
}

func TestConnectionAuthReferenceMustBeEffectiveForItsOwnScope(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Credential scope")
	base := "/api/v1/projects/" + p.ID
	first := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("A"), s, c, ""), 200)
	second := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("B"), s, c, ""), 200)
	variable := configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", wire.VariableInput{Name: "TOKEN", Type: "string", Sensitive: true, ConnectionID: first.ID}, s, c, ""), 200)
	input := httpConfiguration("B")
	input.AuthMode = "reference"
	input.AuthReferenceID = variable.ID
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/connections/"+second.ID, input, s, c, second.Etag), 400)
	input.Name = "A"
	configurationData[wire.Connection](t, configurationRequest(t, a, "PATCH", base+"/connections/"+first.ID, input, s, c, first.Etag), 200)
}

func TestConnectionAccessAppliesPersonalEnvironmentWithoutChangingSharedConfig(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Personal selection")
	q := createProject(t, a, s, c, "Other")
	base := "/api/v1/projects/" + p.ID
	selected := configurationData[wire.Environment](t, configurationRequest(t, a, "POST", base+"/environments", wire.EnvironmentInput{Name: "Selected"}, s, c, ""), 200)
	foreign := configurationData[wire.Environment](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+q.ID+"/environments", wire.EnvironmentInput{Name: "Foreign"}, s, c, ""), 200)
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("Original"), s, c, ""), 200)
	path := base + "/connections/" + conn.ID + "/session-access"
	access := configurationData[wire.ConnectionAccess](t, configurationRequest(t, a, "POST", path, wire.ConnectionAccessRequest{Version: 1, EnvironmentID: selected.ID}, s, c, ""), 200)
	if access.EnvironmentID != selected.ID || access.Version != 1 {
		t.Fatalf("personal environment identity %+v", access)
	}
	configurationData[any](t, configurationRequest(t, a, "POST", path, wire.ConnectionAccessRequest{Version: 1, EnvironmentID: foreign.ID}, s, c, ""), 400)
	stored := configurationData[wire.Connection](t, configurationRequest(t, a, "GET", base+"/connections/"+conn.ID, nil, s, c, ""), 200)
	if stored.EnvironmentID != "" || stored.Version != 1 || stored.Etag != conn.Etag {
		t.Fatalf("personal selection changed shared config %+v", stored)
	}
}

func TestConfigurationPreservesPublicScalarsAndCaseSensitiveNames(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Scalars")
	base := "/api/v1/projects/" + p.ID + "/variables"
	for _, input := range []wire.VariableInput{{Name: "zero", Type: "number", ValueJSON: "0"}, {Name: "ZERO", Type: "boolean", ValueJSON: "false"}, {Name: "NULL", Type: "json", ValueJSON: "null"}, {Name: "OBJECT", Type: "json", ValueJSON: `{"zero":0,"false":false,"null":null}`}} {
		item := configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base, input, s, c, ""), 200)
		if item.ValueJSON != input.ValueJSON || item.Name != input.Name {
			t.Fatalf("scalar serialization changed: %+v", item)
		}
		w := configurationRequest(t, a, "GET", base+"/"+item.ID, nil, s, c, "")
		read := configurationData[wire.Variable](t, w, 200)
		if read.ValueJSON != input.ValueJSON || w.Header().Get("ETag") != item.Etag {
			t.Fatalf("scalar read changed: %+v", read)
		}
	}
	for _, input := range []wire.VariableInput{{Name: "BAD", Type: "number", ValueJSON: `"not-number"`}, {Name: "BAD", Type: "boolean", ValueJSON: "0"}, {Name: "BAD", Type: "json", ValueJSON: "{broken"}, {Name: "not valid", Type: "string", ValueJSON: `"value"`}, {Name: "1NAME", Type: "string", ValueJSON: `"value"`}} {
		configurationData[any](t, configurationRequest(t, a, "POST", base, input, s, c, ""), 400)
	}
}

func TestConfigurationRejectsRecognizableSecretInsidePublicVariable(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Recognizable secret")
	base := "/api/v1/projects/" + p.ID + "/variables"
	for _, input := range []wire.VariableInput{{Name: "VALUE", Type: "string", ValueJSON: `"Bearer fixture-shared-secret-sentinel"`}, {Name: "VALUE", Type: "json", ValueJSON: `{"nested":["Bearer fixture-shared-secret-sentinel"]}`}} {
		w := configurationRequest(t, a, "POST", base, input, s, c, "")
		configurationData[any](t, w, 400)
		if strings.Contains(w.Body.String(), "fixture-shared-secret-sentinel") {
			t.Fatal("error echoed secret value")
		}
	}
	items := configurationData[[]wire.Variable](t, configurationRequest(t, a, "GET", base, nil, s, c, ""), 200)
	if len(items) != 0 {
		t.Fatalf("secret public value persisted %+v", items)
	}
}

func TestSensitiveQueryReferencesFollowEffectiveSourceAndCurrentDefinitions(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Query")
	base := "/api/v1/projects/" + p.ID
	env := configurationData[wire.Environment](t, configurationRequest(t, a, "POST", base+"/environments", wire.EnvironmentInput{Name: "Selected"}, s, c, ""), 200)
	public := configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", wire.VariableInput{Name: "HOST", Type: "string", ValueJSON: `"public"`}, s, c, ""), 200)
	configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", wire.VariableInput{Name: "HOST", Type: "string", Sensitive: true, EnvironmentID: env.ID}, s, c, ""), 200)
	configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", wire.VariableInput{Name: "DERIVED", Type: "string", ValueJSON: `"{{HOST}}"`}, s, c, ""), 200)
	input := httpConfiguration("Query")
	input.Endpoint = "http://localhost:9123/mcp?workspace={{HOST}}"
	input.EnvironmentID = env.ID
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections", input, s, c, ""), 400)
	for _, endpoint := range []string{"http://localhost:9123/{{HOST}}", "http://localhost:9123/%7B%7BHOST%7D%7D"} {
		pathInput := input
		pathInput.Endpoint = endpoint
		configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections", pathInput, s, c, ""), 400)
	}
	input.Endpoint = "http://localhost:9123/mcp?workspace=%7B%7BDERIVED%7D%7D"
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections", input, s, c, ""), 400)
	input.EnvironmentID = ""
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", input, s, c, ""), 200)
	configurationData[wire.ConnectionAccess](t, configurationRequest(t, a, "POST", base+"/connections/"+conn.ID+"/session-access", wire.ConnectionAccessRequest{Version: 1}, s, c, ""), 200)
	configurationData[wire.Variable](t, configurationRequest(t, a, "PATCH", base+"/variables/"+public.ID, wire.VariableInput{Name: "HOST", Type: "string", Sensitive: true}, s, c, public.Etag), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections/"+conn.ID+"/session-access", wire.ConnectionAccessRequest{Version: 1}, s, c, ""), 400)
	stored := configurationData[wire.Connection](t, configurationRequest(t, a, "GET", base+"/connections/"+conn.ID, nil, s, c, ""), 200)
	if stored.Version != 1 || stored.EnvironmentID != "" {
		t.Fatalf("permission check changed config %+v", stored)
	}
}

func TestConcurrentConfigurationSavesOnlyOneVersionWins(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Parallel drafts")
	base := "/api/v1/projects/" + p.ID + "/connections"
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base, httpConfiguration("Original"), s, c, ""), 200)
	second, secondCookie := login(t, a, s.User.Email)
	results := make(chan *httptest.ResponseRecorder, 2)
	var wg sync.WaitGroup
	for _, editor := range []struct {
		name string
		s    wire.Session
		c    *http.Cookie
	}{{"First", s, c}, {"Second", second, secondCookie}} {
		wg.Add(1)
		go func(editor struct {
			name string
			s    wire.Session
			c    *http.Cookie
		}) {
			defer wg.Done()
			results <- configurationRequest(t, a, "PATCH", base+"/"+conn.ID, httpConfiguration(editor.name), editor.s, editor.c, conn.Etag)
		}(editor)
	}
	wg.Wait()
	close(results)
	successes := 0
	winner := ""
	for w := range results {
		if w.Code == 200 {
			saved := configurationData[wire.Connection](t, w, 200)
			successes++
			winner = saved.Name
		} else {
			configurationData[any](t, w, 409)
			if !strings.Contains(w.Body.String(), `"version_conflict"`) {
				t.Fatalf("wrong conflict %s", w.Body.String())
			}
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent successful saves %d", successes)
	}
	stored := configurationData[wire.Connection](t, configurationRequest(t, a, "GET", base+"/"+conn.ID, nil, s, c, ""), 200)
	if stored.Version != 2 || stored.Name != winner {
		t.Fatalf("concurrent lost update %+v winner %s", stored, winner)
	}
}

func TestConfigurationWriteWaitingOnRevocationRechecksRoleBeforeVersion(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Revocation")
	base := "/api/v1/projects/" + p.ID + "/connections"
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base, httpConfiguration("Original"), s, c, ""), 200)
	uid := addUser(t, a, "maintainer@example.test", s.Teams[0].ID, "member")
	ctx := context.Background()
	if _, err := a.DB.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,'maintainer')`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	actor, cookie := login(t, a, "maintainer@example.test")
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err = lockTeamTx(ctx, tx, s.Teams[0].ID); err != nil {
		t.Fatal(err)
	}
	completed := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		completed <- configurationRequest(t, a, "PATCH", base+"/"+conn.ID, httpConfiguration("Unauthorized overwrite"), actor, cookie, conn.Etag)
	}()
	deadline := time.After(3 * time.Second)
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	waiting := false
	for !waiting {
		select {
		case <-deadline:
			tx.Rollback(ctx)
			<-completed
			t.Fatal("configuration write did not wait on membership serialization lock")
		case w := <-completed:
			t.Fatalf("write bypassed held membership lock: %d %s", w.Code, w.Body.String())
		case <-ticker.C:
			err = a.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.wait_event_type='Lock' AND a.query='SELECT id FROM teams WHERE id=$1 FOR UPDATE' AND a.pid IN (SELECT pid FROM pg_locks WHERE relation='teams'::regclass))`).Scan(&waiting)
			if err != nil {
				tx.Rollback(ctx)
				<-completed
				t.Fatal(err)
			}
		}
	}
	if _, err = tx.Exec(ctx, `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	w := <-completed
	configurationData[any](t, w, 403)
	current := configurationData[wire.Connection](t, configurationRequest(t, a, "GET", base+"/"+conn.ID, nil, s, c, ""), 200)
	if current.Name != "Original" || current.Version != 1 {
		t.Fatalf("revoked write persisted %+v", current)
	}
}

func TestResolvedPublicFragmentsCannotCreateRecognizableSecretURL(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Fragments")
	base := "/api/v1/projects/" + p.ID
	for _, v := range []wire.VariableInput{{Name: "PREFIX", Type: "string", ValueJSON: `"sk-"`}, {Name: "SUFFIX", Type: "string", ValueJSON: `"aaaaaaaaaaaaaaaaaaaaaaaa"`}} {
		configurationData[wire.Variable](t, configurationRequest(t, a, "POST", base+"/variables", v, s, c, ""), 200)
	}
	input := httpConfiguration("Recognized derived secret")
	input.Endpoint = "https://mcp.example/{{PREFIX}}{{SUFFIX}}"
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections", input, s, c, ""), 400)
	input.Endpoint = "https://mcp.example/%73%6b-aaaaaaaaaaaaaaaaaaaaaaaa"
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections", input, s, c, ""), 400)
}
