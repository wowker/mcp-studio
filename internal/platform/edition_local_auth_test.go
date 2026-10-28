//go:build local

package platform

import (
	"context"
	"encoding/json"
	"fmt"
	"mcp-studio/internal/wire"
	"mcp-studio/migrations"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TestLocalEditionSubjectAndProjectIsolation exercises the local-edition
// authorization branches end to end: one handler that is normally
// team-member-gated must accept the local subject, and the same handler must
// still refuse to read a project that does not exist (project_id isolation,
// E04b).
func TestLocalEditionSubjectAndProjectIsolation(t *testing.T) {
	databaseURL := os.Getenv("MCP_STUDIO_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("local edition tests need an isolated test database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	// Run migrations on this new schema. Local edition startup (E05) creates
	// its own user/team/project rows; here we seed the minimum rows required
	// by the shared schema so tests can exercise isolation without E05.
	if err := prepareLocalFixture(ctx, pool); err != nil {
		t.Fatal(err)
	}

	subject := wire.User{ID: localFixtureUser, Email: "local@fixture.test", Name: "Local Owner", Verified: true}
	teams := []wire.Team{{ID: localFixtureTeam, Name: "Local", Role: "owner"}}
	cfg := Config{Origin: "http://127.0.0.1:8080", StaticDir: "", Idle: 8 * time.Hour, Absolute: 24 * time.Hour}
	a := &App{DB: pool, Now: time.Now, Config: cfg}
	a.localSubject = subject
	a.localTeams = teams

	// E04a: listProjects for the fixture team returns the fixture project
	// without any team_members row (member check is short-circuited).
	req := httptest.NewRequest("GET", "/api/v1/teams/"+localFixtureTeam+"/projects", strings.NewReader(""))
	req.Header.Set("Origin", cfg.Origin)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatalf("listProjects status %d body %s", w.Code, w.Body.String())
	}
	var wrapped struct {
		Data []wire.Project `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &wrapped); err != nil {
		t.Fatal(err)
	}
	projects := wrapped.Data
	if len(projects) != 1 || projects[0].ID != localFixtureProject {
		t.Fatalf("local subject should see its fixture project, got %v", projects)
	}
	if !projects[0].CanManage {
		t.Fatal("local subject must have full management on its projects")
	}

	// E04b: cross-project isolation — a fabricated project_id that does not
	// exist on this instance must still reject with 404, even though the local
	// subject is authorized to read its own projects.
	req = httptest.NewRequest("GET", "/api/v1/projects/does-not-exist", strings.NewReader(""))
	req.Header.Set("Origin", cfg.Origin)
	w = httptest.NewRecorder()
	a.Handler().ServeHTTP(w, req)
	if w.Code != 404 {
		t.Fatalf("cross-project isolation must hold, got %d body %s", w.Code, w.Body.String())
	}

	// E04b cross-team isolation: a fabricated team_id must also reject.
	req = httptest.NewRequest("GET", "/api/v1/teams/not-a-team/projects", strings.NewReader(""))
	req.Header.Set("Origin", cfg.Origin)
	w = httptest.NewRecorder()
	a.Handler().ServeHTTP(w, req)
	if w.Code != 403 {
		t.Fatalf("cross-team isolation must hold, got %d body %s", w.Code, w.Body.String())
	}
}

// TestLocalEditionSessionAlwaysValid is the regression for the E08a finding:
// without a local-edition session variant the frontend bootstrap received
// session_expired and stopped on the sign-in page. The local edition has no
// login flow, so /api/v1/session must report the local subject with no cookie.
func TestLocalEditionSessionAlwaysValid(t *testing.T) {
	subject := wire.User{ID: "local-subject", Email: "local@mcp-studio.local", Name: "Local", Verified: true}
	teams := []wire.Team{{ID: "local-team", Name: "Local", Role: "owner"}}
	cfg := Config{Origin: "http://127.0.0.1:8080", Idle: 8 * time.Hour, Absolute: 24 * time.Hour}
	a := &App{Now: time.Now, Config: cfg}
	a.localSubject = subject
	a.localTeams = teams

	req := httptest.NewRequest("GET", "/api/v1/session", strings.NewReader(""))
	req.Header.Set("Origin", cfg.Origin)
	s, err := a.session(req)
	if err != nil {
		t.Fatalf("local session must not fail: %v", err)
	}
	if s.User.ID != subject.ID || s.User.Email != subject.Email || !s.User.Verified {
		t.Fatalf("local session must report the local subject, got %+v", s.User)
	}
	if len(s.Teams) != 1 || s.Teams[0].Role != "owner" {
		t.Fatalf("local session must carry local teams, got %+v", s.Teams)
	}
	if s.Csrf != "" {
		t.Fatalf("local session has no cookie-bound csrf, got %q", s.Csrf)
	}
	if s.ExpiresAt == "" {
		t.Fatal("local session must report an expiry instant")
	}

	// Without a local subject the session cannot be fabricated.
	a.localSubject = wire.User{}
	if _, err = a.session(req); err == nil {
		t.Fatal("session without a local subject must fail")
	}
}

// prepareLocalFixture creates a fresh schema and inserts the absolute minimum
// rows required by the shared schema — one user, one team, one project, plus
// their membership rows — so local-edition auth branches can run without the
// sign-in flow. Real user creation happens during E05 startup.
const (
	localFixtureUser    = "local-fixture-user"
	localFixtureTeam    = "local-fixture-team"
	localFixtureProject = "local-fixture-project"
)

func prepareLocalFixture(ctx context.Context, pool *pgxpool.Pool) error {
	if err := migrations.Apply(ctx, pool); err != nil {
		return err
	}
	hash, err := passwordHash("fixture-password-123")
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `DELETE FROM project_members WHERE project_id=$1`, localFixtureProject)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `DELETE FROM projects WHERE id=$1`, localFixtureProject)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `DELETE FROM team_members WHERE team_id=$1`, localFixtureTeam)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `DELETE FROM teams WHERE id=$1`, localFixtureTeam)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, `DELETE FROM users WHERE id=$1`, localFixtureUser)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, fmt.Sprintf(`INSERT INTO users VALUES('%s','local@fixture.test','Local Owner',$1,true)`, localFixtureUser), hash)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, fmt.Sprintf(`INSERT INTO teams VALUES('%s','Local')`, localFixtureTeam))
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, fmt.Sprintf(`INSERT INTO team_members VALUES('%s','%s','owner')`, localFixtureTeam, localFixtureUser))
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, fmt.Sprintf(`INSERT INTO projects VALUES('%s','%s','Local Project','local-project','')`, localFixtureProject, localFixtureTeam))
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx, fmt.Sprintf(`INSERT INTO project_members VALUES('%s','%s','maintainer')`, localFixtureProject, localFixtureUser))
	return err
}
