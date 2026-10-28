//go:build !local

package platform

import (
	"context"
	"encoding/json"
	"errors"
	"mcp-studio/internal/wire"
	"net/http"
	"sync"
	"testing"
	"time"
)

func invite(t *testing.T, a *App, s wire.Session, c *http.Cookie, p wire.Project, email string, role wire.TeamRole) wire.Invitation {
	t.Helper()
	code, data, _ := request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations", wire.InviteRequest{Email: email, TeamRole: role, ProjectRole: "developer", Days: 7}, &s, c)
	requireStatus(t, code, 200)
	var inv wire.Invitation
	if err := json.Unmarshal(data, &inv); err != nil {
		t.Fatal(err)
	}
	return inv
}
func joinFixture(t *testing.T, a *App, p, uid, role string) {
	t.Helper()
	if _, e := a.DB.Exec(context.Background(), `INSERT INTO project_members VALUES($1,$2,$3) ON CONFLICT(project_id,user_id) DO UPDATE SET role=EXCLUDED.role`, p, uid, role); e != nil {
		t.Fatal(e)
	}
}
func TestInvitesRequireIdentityAndExplicitAcceptance(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	inv := invite(t, a, s, c, p, " New@Example.Test ", "member")
	tok := m.lastCode()
	if inv.Email != "new@example.test" {
		t.Fatal(inv.Email)
	}
	var n int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM project_members WHERE project_id=$1`, p.ID).Scan(&n)
	if n != 1 {
		t.Fatalf("invite added member %d", n)
	}
	status, _, _ := request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations", wire.InviteRequest{Email: inv.Email, TeamRole: "member", ProjectRole: "developer", Days: 7}, &s, c)
	requireStatus(t, status, 409)
	uid := addUser(t, a, "new@example.test", "", "")
	ns, nc := login(t, a, "new@example.test")
	path := "/api/v1/invitations/" + inv.ID + "/accept"
	status, _, _ = request(t, a, "POST", path, wire.TokenRequest{Token: "wrong"}, &ns, nc)
	requireStatus(t, status, 400)
	status, _, _ = request(t, a, "POST", path, wire.TokenRequest{Token: tok}, &s, c)
	requireStatus(t, status, 403)
	status, _, _ = request(t, a, "POST", path, wire.TokenRequest{Token: tok}, &ns, nc)
	requireStatus(t, status, 200)
	status, _, _ = request(t, a, "POST", path, wire.TokenRequest{Token: tok}, &ns, nc)
	requireStatus(t, status, 200)
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, uid).Scan(&n)
	if n != 1 {
		t.Fatal(n)
	}
}
func TestInviteExpiryRevokeResendAndSenderRevocation(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	inv := invite(t, a, s, c, p, "u@example.test", "member")
	oldToken := m.lastCode()
	uid := addUser(t, a, "u@example.test", s.Teams[0].ID, "admin")
	us, uc := login(t, a, "u@example.test")
	base := a.Now()
	a.Now = func() time.Time { return base.Add(7 * 24 * time.Hour) }
	us, uc = login(t, a, "u@example.test")
	code, _, _ := request(t, a, "POST", "/api/v1/invitations/"+inv.ID+"/accept", wire.TokenRequest{Token: oldToken}, &us, uc)
	requireStatus(t, code, 400)
	s, c = login(t, a, s.User.Email)
	code, data, _ := request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations/"+inv.ID+"/resend", nil, &s, c)
	requireStatus(t, code, 200)
	var fresh wire.Invitation
	json.Unmarshal(data, &fresh)
	if fresh.ID == inv.ID {
		t.Fatal("resend reused id")
	}
	newToken := m.lastCode()
	us, uc = login(t, a, "u@example.test")
	code, _, _ = request(t, a, "POST", "/api/v1/invitations/"+inv.ID+"/accept", wire.TokenRequest{Token: oldToken}, &us, uc)
	requireStatus(t, code, 400)
	code, _, _ = request(t, a, "POST", "/api/v1/invitations/"+fresh.ID+"/accept", wire.TokenRequest{Token: newToken}, &us, uc)
	requireStatus(t, code, 200)
	var role string
	a.DB.QueryRow(context.Background(), `SELECT role FROM team_members WHERE user_id=$1 AND team_id=$2`, uid, s.Teams[0].ID).Scan(&role)
	if role != "admin" {
		t.Fatal("invitation downgraded team role")
	}
	code, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations/"+fresh.ID+"/resend", nil, &s, c)
	requireStatus(t, code, 409)
	another := invite(t, a, s, c, p, "v@example.test", "member")
	tokenV := m.lastCode()
	addUser(t, a, "v@example.test", "", "")
	vs, vc := login(t, a, "v@example.test")
	code, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations/"+another.ID+"/revoke", nil, &s, c)
	requireStatus(t, code, 200)
	code, _, _ = request(t, a, "POST", "/api/v1/invitations/"+another.ID+"/accept", wire.TokenRequest{Token: tokenV}, &vs, vc)
	requireStatus(t, code, 400)
}
func TestInviteSenderCurrentAuthorityAndNoExistingRoleOverwrite(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	mid := addUser(t, a, "maintainer@example.test", s.Teams[0].ID, "member")
	joinFixture(t, a, p.ID, mid, "maintainer")
	ms, mc := login(t, a, "maintainer@example.test")
	inv := invite(t, a, ms, mc, p, "u@example.test", "member")
	tok := m.lastCode()
	uid := addUser(t, a, "u@example.test", s.Teams[0].ID, "member")
	us, uc := login(t, a, "u@example.test")
	a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE user_id=$1 AND project_id=$2`, mid, p.ID)
	code, _, _ := request(t, a, "POST", "/api/v1/invitations/"+inv.ID+"/accept", wire.TokenRequest{Token: tok}, &us, uc)
	requireStatus(t, code, 403)
	joinFixture(t, a, p.ID, mid, "maintainer")
	joinFixture(t, a, p.ID, uid, "maintainer")
	code, _, _ = request(t, a, "POST", "/api/v1/invitations/"+inv.ID+"/accept", wire.TokenRequest{Token: tok}, &us, uc)
	requireStatus(t, code, 200)
	var role string
	a.DB.QueryRow(context.Background(), `SELECT role FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, uid).Scan(&role)
	if role != "maintainer" {
		t.Fatal("old invitation replaced new role")
	}
}
func TestAdminGrantSelfAndTeamProjectRoleBoundaries(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	team := s.Teams[0].ID
	admin := addUser(t, a, "admin@example.test", team, "admin")
	addUser(t, a, "admin2@example.test", team, "admin")
	maint := addUser(t, a, "maint@example.test", team, "member")
	joinFixture(t, a, p.ID, maint, "maintainer")
	as, ac := login(t, a, "admin@example.test")
	code, _, _ := request(t, a, "PATCH", "/api/v1/projects/"+p.ID+"/members/"+admin, wire.MemberRequest{Role: "developer"}, &as, ac)
	requireStatus(t, code, 403)
	code, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations", wire.InviteRequest{Email: "other@example.test", TeamRole: "admin", ProjectRole: "developer", Days: 7}, &as, ac)
	requireStatus(t, code, 403)
	code, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations", wire.InviteRequest{Email: as.User.Email, TeamRole: "member", ProjectRole: "developer", Days: 7}, &as, ac)
	requireStatus(t, code, 403)
	ms, mc := login(t, a, "maint@example.test")
	code, _, _ = request(t, a, "POST", "/api/v1/teams/"+team+"/projects", wire.ProjectRequest{Name: "No"}, &ms, mc)
	requireStatus(t, code, 403)
	code, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations", wire.InviteRequest{Email: "other@example.test", TeamRole: "admin", ProjectRole: "developer", Days: 7}, &ms, mc)
	requireStatus(t, code, 403)
}
func TestMemberProtectionsConcurrentAndTeamScope(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	team := s.Teams[0].ID
	p := createProject(t, a, s, c, "A")
	q := createProject(t, a, s, c, "B")
	first := addUser(t, a, "first@example.test", team, "member")
	second := addUser(t, a, "second@example.test", team, "member")
	joinFixture(t, a, p.ID, first, "maintainer")
	joinFixture(t, a, p.ID, second, "maintainer")
	joinFixture(t, a, q.ID, first, "maintainer")
	a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE user_id=$1`, s.User.ID)
	code, _, _ := request(t, a, "DELETE", "/api/v1/teams/"+team+"/members/"+first, nil, &s, c)
	requireStatus(t, code, 409)
	code, _, _ = request(t, a, "DELETE", "/api/v1/teams/"+team+"/members/"+s.User.ID, nil, &s, c)
	requireStatus(t, code, 403)
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for _, target := range []string{first, second} {
		wg.Add(1)
		go func(uid string) {
			defer wg.Done()
			code, _, _ := request(t, a, "DELETE", "/api/v1/projects/"+p.ID+"/members/"+uid, nil, &s, c)
			codes <- code
		}(target)
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
		t.Fatal("last maintainer race", successes)
	}
	var count int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM project_members WHERE project_id=$1 AND role='maintainer'`, p.ID).Scan(&count)
	if count != 1 {
		t.Fatal(count)
	}
}
func TestTeamRemovalRevokesAllProjectsAndPendingInvites(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	team := s.Teams[0].ID
	p := createProject(t, a, s, c, "A")
	q := createProject(t, a, s, c, "B")
	uid := addUser(t, a, "user@example.test", team, "member")
	joinFixture(t, a, p.ID, uid, "developer")
	joinFixture(t, a, q.ID, uid, "viewer")
	us, uc := login(t, a, "user@example.test")
	a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, uid)
	inv := invite(t, a, s, c, p, "user@example.test", "member")
	code, _, _ := request(t, a, "DELETE", "/api/v1/teams/"+team+"/members/"+uid, nil, &s, c)
	requireStatus(t, code, 200)
	code, _, _ = request(t, a, "GET", "/api/v1/projects/"+q.ID, nil, &us, uc)
	requireStatus(t, code, 403)
	var status string
	a.DB.QueryRow(context.Background(), `SELECT status FROM invitations WHERE id=$1`, inv.ID).Scan(&status)
	if status != "revoked" {
		t.Fatal(status)
	}
	var n int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM project_members WHERE user_id=$1`, uid).Scan(&n)
	if n != 0 {
		t.Fatal(n)
	}
}
func TestMailFailureAndInvalidInvitationDoNotCreateMembers(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	for _, input := range []wire.InviteRequest{{Email: "bad", TeamRole: "member", ProjectRole: "developer", Days: 7}, {Email: "u@example.test", TeamRole: "owner", ProjectRole: "developer", Days: 7}, {Email: "u@example.test", TeamRole: "member", ProjectRole: "developer", Days: 2}} {
		code, _, _ := request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations", input, &s, c)
		requireStatus(t, code, 400)
	}
	m.err = errors.New("fixture mail failure")
	inv := invite(t, a, s, c, p, "u@example.test", "member")
	if inv.Delivery != "failed" {
		t.Fatal(inv.Delivery)
	}
	var n int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM project_members WHERE project_id=$1`, p.ID).Scan(&n)
	if n != 1 {
		t.Fatal(n)
	}
}

func TestConcurrentInvitationCreationAndAcceptance(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			code, _, _ := request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations", wire.InviteRequest{Email: "u@example.test", TeamRole: "member", ProjectRole: "developer", Days: 7}, &s, c)
			codes <- code
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
		t.Fatal("duplicate invite", successes)
	}
	var invID string
	a.DB.QueryRow(context.Background(), `SELECT id FROM invitations WHERE project_id=$1 AND email='u@example.test'`, p.ID).Scan(&invID)
	tok := m.lastCode()
	uid := addUser(t, a, "u@example.test", "", "")
	us, uc := login(t, a, "u@example.test")
	codes = make(chan int, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			code, _, _ := request(t, a, "POST", "/api/v1/invitations/"+invID+"/accept", wire.TokenRequest{Token: tok}, &us, uc)
			codes <- code
		}()
	}
	wg.Wait()
	close(codes)
	for code := range codes {
		requireStatus(t, code, 200)
	}
	var count int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, uid).Scan(&count)
	if count != 1 {
		t.Fatal(count)
	}
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM audits WHERE project_id=$1 AND action='invitation.accepted'`, p.ID).Scan(&count)
	if count != 1 {
		t.Fatal("duplicate accept audit", count)
	}
}
func TestRemovedMaintainerOldSessionNoManagementAndViewerReadOnly(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	team := s.Teams[0].ID
	uid := addUser(t, a, "m@example.test", team, "member")
	viewer := addUser(t, a, "viewer@example.test", team, "member")
	joinFixture(t, a, p.ID, uid, "maintainer")
	joinFixture(t, a, p.ID, viewer, "viewer")
	ms, mc := login(t, a, "m@example.test")
	vs, vc := login(t, a, "viewer@example.test")
	code, _, _ := request(t, a, "GET", "/api/v1/projects/"+p.ID+"/members", nil, &vs, vc)
	requireStatus(t, code, 200)
	code, _, _ = request(t, a, "PATCH", "/api/v1/projects/"+p.ID+"/members/"+uid, wire.MemberRequest{Role: "developer"}, &vs, vc)
	requireStatus(t, code, 403)
	code, _, _ = request(t, a, "DELETE", "/api/v1/projects/"+p.ID+"/members/"+uid, nil, &s, c)
	requireStatus(t, code, 200)
	code, _, _ = request(t, a, "GET", "/api/v1/projects/"+p.ID+"/members", nil, &ms, mc)
	requireStatus(t, code, 403)
	code, _, _ = request(t, a, "POST", "/api/v1/projects/"+p.ID+"/invitations", wire.InviteRequest{Email: "u@example.test", TeamRole: "member", ProjectRole: "developer", Days: 7}, &ms, mc)
	requireStatus(t, code, 403)
}
func TestOwnerAdminSelfAndLastMaintainerRoleProtection(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	team := s.Teams[0].ID
	admin := addUser(t, a, "admin@example.test", team, "admin")
	otherAdmin := addUser(t, a, "other-admin@example.test", team, "admin")
	maint := addUser(t, a, "m@example.test", team, "member")
	joinFixture(t, a, p.ID, maint, "maintainer")
	as, ac := login(t, a, "admin@example.test")
	for _, target := range []string{s.User.ID, admin, otherAdmin} {
		code, _, _ := request(t, a, "DELETE", "/api/v1/teams/"+team+"/members/"+target, nil, &as, ac)
		requireStatus(t, code, 403)
		code, _, _ = request(t, a, "PATCH", "/api/v1/teams/"+team+"/members/"+target, wire.TeamMemberRequest{Role: "member"}, &as, ac)
		requireStatus(t, code, 403)
	}
	code, _, _ := request(t, a, "DELETE", "/api/v1/projects/"+p.ID+"/members/"+s.User.ID, nil, &as, ac)
	requireStatus(t, code, 403)
	a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE user_id=$1 AND project_id=$2`, s.User.ID, p.ID)
	code, _, _ = request(t, a, "PATCH", "/api/v1/projects/"+p.ID+"/members/"+maint, wire.MemberRequest{Role: "developer"}, &s, c)
	requireStatus(t, code, 409)
	code, _, _ = request(t, a, "PATCH", "/api/v1/teams/"+team+"/members/"+maint, wire.TeamMemberRequest{Role: "admin"}, &as, ac)
	requireStatus(t, code, 403)
	code, _, _ = request(t, a, "PATCH", "/api/v1/teams/"+team+"/members/"+maint, wire.TeamMemberRequest{Role: "admin"}, &s, c)
	requireStatus(t, code, 200)
}
func TestInvitationEntryMaskedAndUnverifiedAcceptanceRejected(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "Project")
	inv := invite(t, a, s, c, p, "sensitive-name@example.test", "member")
	tok := m.lastCode()
	code, data, _ := request(t, a, "GET", "/api/v1/invitations/"+inv.ID, nil, nil, nil)
	requireStatus(t, code, 200)
	var entry wire.InviteEntry
	json.Unmarshal(data, &entry)
	if entry.EmailHint != "***@example.test" {
		t.Fatalf("identity disclosure %s", data)
	}
	uid := addUser(t, a, "sensitive-name@example.test", "", "")
	a.DB.Exec(context.Background(), `UPDATE users SET verified=false WHERE id=$1`, uid)
	us, uc := login(t, a, "sensitive-name@example.test")
	code, _, _ = request(t, a, "POST", "/api/v1/invitations/"+inv.ID+"/accept", wire.TokenRequest{Token: tok}, &us, uc)
	requireStatus(t, code, 403)
}
