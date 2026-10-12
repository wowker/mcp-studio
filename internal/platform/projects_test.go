package platform

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/wire"
	"net/http"
	"sync"
	"testing"
)

func createProject(t *testing.T, a *App, s wire.Session, c *http.Cookie, name string) wire.Project {
	t.Helper()
	status, data, _ := request(t, a, "POST", "/api/v1/teams/"+s.Teams[0].ID+"/projects", wire.ProjectRequest{Name: name, Description: "fixture description"}, &s, c)
	requireStatus(t, status, 200)
	var p wire.Project
	if err := json.Unmarshal(data, &p); err != nil {
		t.Fatal(err)
	}
	return p
}
func TestProjectNamesAndCreatorRelationship(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	base := "/api/v1/teams/" + s.Teams[0].ID + "/projects"
	status, _, _ := request(t, a, "POST", base, wire.ProjectRequest{Name: "  "}, &s, c)
	requireStatus(t, status, 400)
	p := createProject(t, a, s, c, " Commerce ")
	if p.Name != "Commerce" || p.Role != "maintainer" || !p.CanRead {
		t.Fatalf("project %+v", p)
	}
	status, _, _ = request(t, a, "POST", base, wire.ProjectRequest{Name: "commerce"}, &s, c)
	requireStatus(t, status, 409)
	var count int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM project_members WHERE project_id=$1 AND user_id=$2 AND role='maintainer'`, p.ID, s.User.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("creator relationship %d %v", count, err)
	}
	otherTeam := id()
	if _, err := a.DB.Exec(context.Background(), `INSERT INTO teams VALUES($1,'Other team')`, otherTeam); err != nil {
		t.Fatal(err)
	}
	if _, err := a.DB.Exec(context.Background(), `INSERT INTO team_members VALUES($1,$2,'owner')`, otherTeam, s.User.ID); err != nil {
		t.Fatal(err)
	}
	status, _, _ = request(t, a, "POST", "/api/v1/teams/"+otherTeam+"/projects", wire.ProjectRequest{Name: "Commerce"}, &s, c)
	requireStatus(t, status, 200)
	addUser(t, a, "ordinary@example.test", s.Teams[0].ID, "member")
	ms, mc := login(t, a, "ordinary@example.test")
	status, _, _ = request(t, a, "GET", "/api/v1/teams/"+otherTeam+"/projects", nil, &ms, mc)
	requireStatus(t, status, 403)
}
func TestDirectoryDoesNotGrantProjectContentAndOwnerTakeoverScoped(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "A")
	q := createProject(t, a, s, c, "B")
	team := s.Teams[0].ID
	adminID := addUser(t, a, "admin@example.test", team, "admin")
	as, ac := login(t, a, "admin@example.test")
	status, data, _ := request(t, a, "GET", "/api/v1/teams/"+team+"/projects", nil, &as, ac)
	requireStatus(t, status, 200)
	var projects []wire.Project
	json.Unmarshal(data, &projects)
	if len(projects) != 2 || projects[0].CanRead || projects[1].CanRead {
		t.Fatalf("directory grants content %s", data)
	}
	status, _, _ = request(t, a, "GET", "/api/v1/projects/"+p.ID, nil, &as, ac)
	requireStatus(t, status, 200)
	status, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/takeover", wire.TakeoverRequest{Confirmed: true, Reason: "fixture takeover"}, &as, ac)
	requireStatus(t, status, 403)
	if _, err := a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE user_id=$1`, s.User.ID); err != nil {
		t.Fatal(err)
	}
	status, _, _ = request(t, a, "GET", "/api/v1/projects/"+p.ID, nil, &s, c)
	requireStatus(t, status, 200)
	status, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/takeover", wire.TakeoverRequest{Confirmed: false, Reason: "fixture"}, &s, c)
	requireStatus(t, status, 400)
	status, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/takeover", wire.TakeoverRequest{Confirmed: true, Reason: " "}, &s, c)
	requireStatus(t, status, 400)
	status, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/takeover", wire.TakeoverRequest{Confirmed: true, Reason: "Recover abandoned project"}, &s, c)
	requireStatus(t, status, 200)
	status, data, _ = request(t, a, "GET", "/api/v1/projects/"+q.ID, nil, &s, c)
	requireStatus(t, status, 200)
	var untouched wire.Project
	json.Unmarshal(data, &untouched)
	if untouched.CanRead || untouched.Role != "" {
		t.Fatal("takeover polluted another project", untouched)
	}
	status, data, _ = request(t, a, "GET", "/api/v1/projects/"+p.ID+"/audit", nil, &s, c)
	requireStatus(t, status, 200)
	var audits []wire.Audit
	json.Unmarshal(data, &audits)
	found := false
	for _, entry := range audits {
		if entry.ProjectID == p.ID && entry.Action == "project.taken_over" && entry.Reason == "Recover abandoned project" {
			found = true
		}
	}
	if !found {
		t.Fatalf("audit missing %s", data)
	}
	_ = adminID
}
func TestConcurrentProjectCreationOnlyOne(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			status, _, _ := request(t, a, "POST", "/api/v1/teams/"+s.Teams[0].ID+"/projects", wire.ProjectRequest{Name: "Same"}, &s, c)
			codes <- status
		}()
	}
	wg.Wait()
	close(codes)
	successes := 0
	for code := range codes {
		if code == 200 {
			successes++
		} else {
			requireStatus(t, code, 409)
		}
	}
	if successes != 1 {
		t.Fatalf("duplicate creation: %d", successes)
	}
}

func TestDirectoryManagersReceiveAccessMetadataWithoutContent(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	team := s.Teams[0].ID
	addUser(t, a, "admin@example.test", team, "admin")
	addUser(t, a, "unjoined@example.test", team, "member")
	as, ac := login(t, a, "admin@example.test")
	ms, mc := login(t, a, "unjoined@example.test")
	a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, s.User.ID)
	for _, viewer := range []struct {
		s     wire.Session
		c     *http.Cookie
		owner bool
	}{{as, ac, false}, {s, c, true}} {
		code, data, _ := request(t, a, "GET", "/api/v1/projects/"+p.ID, nil, &viewer.s, viewer.c)
		requireStatus(t, code, 200)
		var scope wire.Project
		json.Unmarshal(data, &scope)
		if scope.CanRead || scope.Role != "" || !scope.CanManage || scope.CanTakeover != viewer.owner {
			t.Fatalf("directory metadata grants content or blocks management %+v", scope)
		}
	}
	code, _, _ := request(t, a, "GET", "/api/v1/projects/"+p.ID, nil, &ms, mc)
	requireStatus(t, code, 403)
}
