//go:build !local

package platform

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/wire"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// B1 身份与协作：只补齐正式预期（docs/design-baseline-v2/design-handoff/06-handoff-and-acceptance.md）
// 中现有回归未显式断言的子句。其余子句的既有证据见
// tests/evidence/acceptance-b1/coverage-map.md。

// A01：失败（400/409）后重试成功，团队内最终只存在预期数量的项目，且重试创建者为维护者。
func TestB1A01RetryAfterFailureCreatesSingleProject(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	base := "/api/v1/teams/" + s.Teams[0].ID + "/projects"
	existing := createProject(t, a, s, c, "Existing")

	configurationData[any](t, configurationRequest(t, a, "POST", base, wire.ProjectRequest{Name: "   "}, s, c, ""), 400)
	configurationData[any](t, configurationRequest(t, a, "POST", base, wire.ProjectRequest{Name: " existing "}, s, c, ""), 409)
	var afterFailures int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM projects WHERE team_id=$1`, s.Teams[0].ID).Scan(&afterFailures)
	if afterFailures != 1 {
		t.Fatalf("failed creations persisted projects: %d", afterFailures)
	}

	retried := configurationData[wire.Project](t, configurationRequest(t, a, "POST", base, wire.ProjectRequest{Name: "Retried"}, s, c, ""), 200)
	if retried.ID == existing.ID || retried.Role != "maintainer" || !retried.CanManage {
		t.Fatalf("retry did not create a distinct maintained project: %+v", retried)
	}
	var total, duplicates int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM projects WHERE team_id=$1`, s.Teams[0].ID).Scan(&total)
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM projects WHERE team_id=$1 AND name_key=$2`, s.Teams[0].ID, canonical("Retried")).Scan(&duplicates)
	if total != 2 || duplicates != 1 {
		t.Fatalf("retry produced duplicates: total=%d duplicates=%d", total, duplicates)
	}
}

// A22：Viewer 既不能执行也不能凭记录 ID 直取他人私有记录。
func TestB1A22ViewerCannotExecuteOrReadPrivateDetail(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Private")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("source"), s, c, ""), 200)

	viewerID := addUser(t, a, "viewer@example.test", s.Teams[0].ID, "member")
	joinFixture(t, a, p.ID, viewerID, "viewer")
	vs, vc := login(t, a, "viewer@example.test")

	private := frozenUpload(t, s.User.ID, p.ID, conn, "saved", "private")
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", private, s, c, ""), 200)

	list := configurationData[wire.RecordPage](t, configurationRequest(t, a, "GET", base+"/records?kind=saved", nil, vs, vc, ""), 200)
	if len(list.Items) != 0 {
		t.Fatalf("viewer listed another private record: %+v", list.Items)
	}
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, vs, vc, ""), 404)
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/record-operations/"+private.OperationID, nil, vs, vc, ""), 404)

	execute := frozenUpload(t, viewerID, p.ID, conn, "history", "project")
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", execute, vs, vc, ""), 403)
}

// A36 / A58：会话到期后上传被暂停，错误认证也不能恢复访问或读到内容。
func TestB1A36A58SessionExpiryPausesUploadsAndWrongAuthCannotRestore(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Session")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("source"), s, c, ""), 200)

	allowed := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	allowedReceipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", allowed, s, c, ""), 200)
	var stored int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM records WHERE id=$1`, allowedReceipt.RecordID).Scan(&stored)
	if stored != 1 {
		t.Fatalf("seeded record missing; leak assertions would be vacuous: %d", stored)
	}
	// 泄漏检查针对真实存在的记录 ID：该 ID 在越权响应中出现即视为内容泄露。
	leak := func(body string) bool { return strings.Contains(body, allowedReceipt.RecordID) }

	base0 := a.Now()
	a.Now = func() time.Time { return base0.Add(8*time.Hour + time.Second) }
	paused := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	w := configurationRequest(t, a, "POST", base+"/record-uploads", paused, s, c, "")
	if w.Code != 401 {
		t.Fatalf("expired session still uploads: %d %s", w.Code, w.Body.String())
	}
	var failure struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &failure); err != nil || failure.Error.Code != "session_expired" {
		t.Fatalf("expired upload not reported as session_expired: %s err=%v", w.Body.String(), err)
	}
	read := configurationRequest(t, a, "GET", base+"/records?kind=history", nil, s, c, "")
	if read.Code != 401 || leak(read.Body.String()) {
		t.Fatalf("expired session reads content: %d %s", read.Code, read.Body.String())
	}

	forged := *c
	forged.Value = "forged-" + c.Value
	for _, attempt := range []*httptest.ResponseRecorder{
		configurationRequest(t, a, "GET", base+"/records?kind=history", nil, s, &forged, ""),
		configurationRequest(t, a, "POST", base+"/record-uploads", paused, s, &forged, ""),
	} {
		if attempt.Code != 401 || leak(attempt.Body.String()) {
			t.Fatalf("forged authentication restored access: %d %s", attempt.Code, attempt.Body.String())
		}
	}
}

// A37：Owner 接管被弃项目后仍不能读取他人私有记录。
func TestB1A37TakeoverOwnerStillCannotReadOthersPrivateRecords(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Abandoned")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("source"), s, c, ""), 200)

	devID := addUser(t, a, "dev@example.test", s.Teams[0].ID, "member")
	joinFixture(t, a, p.ID, devID, "developer")
	ds, dc := login(t, a, "dev@example.test")
	private := frozenUpload(t, devID, p.ID, conn, "saved", "private")
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", private, ds, dc, ""), 200)
	configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, ds, dc, ""), 200)

	// 产品不提供「移除自己」的接口（A27 保护），用直接删行模拟「被弃项目」。
	if _, err := a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, s.User.ID); err != nil {
		t.Fatal(err)
	}
	scope := configurationData[wire.Project](t, configurationRequest(t, a, "GET", base, nil, s, c, ""), 200)
	if scope.CanRead {
		t.Fatalf("abandoned project still grants content before takeover: %+v", scope)
	}
	configurationData[wire.Accepted](t, configurationRequest(t, a, "POST", base+"/takeover", wire.TakeoverRequest{Confirmed: true, Reason: "Recover abandoned project"}, s, c, ""), 200)

	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, s, c, ""), 404)
	listed := configurationData[wire.RecordPage](t, configurationRequest(t, a, "GET", base+"/records?kind=saved", nil, s, c, ""), 200)
	if len(listed.Items) != 0 {
		t.Fatalf("takeover owner read another private record: %+v", listed.Items)
	}
}

// A28：移除失败（目标不在项目内）后按同一目标重试成功，影响范围限于该项目。
func TestB1A28FailedRemovalRetriesToScopedSuccess(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Removal")
	base := "/api/v1/projects/" + p.ID
	uid := addUser(t, a, "remove@example.test", s.Teams[0].ID, "member")

	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/members/"+uid, nil, s, c, ""), 404)

	joinFixture(t, a, p.ID, uid, "developer")
	members := configurationData[[]wire.Member](t, configurationRequest(t, a, "GET", base+"/members", nil, s, c, ""), 200)
	if len(members) != 2 {
		t.Fatalf("member list before removal: %+v", members)
	}
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", base+"/members/"+uid, nil, s, c, ""), 200)

	var remaining, removals int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM project_members WHERE project_id=$1`, p.ID).Scan(&remaining)
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM audits WHERE project_id=$1 AND action='project.member.removed' AND target_id=$2`, p.ID, uid).Scan(&removals)
	if remaining != 1 || removals != 1 {
		t.Fatalf("retried removal scope wrong: members=%d audits=%d", remaining, removals)
	}
}

// A55：项目 A 为 Viewer、B 为 Developer 时，后台按记录所属项目校验，
// 不因当前停留在 A 而误判 B 的上传，也不因角色出现在 B 而放开 A。
func TestB1A55ProjectScopedUploadIgnoresCurrentScreenRole(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	pa := createProject(t, a, s, c, "Project A")
	pb := createProject(t, a, s, c, "Project B")
	baseA := "/api/v1/projects/" + pa.ID
	baseB := "/api/v1/projects/" + pb.ID
	connA := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", baseA+"/connections", httpConfiguration("source A"), s, c, ""), 200)
	connB := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", baseB+"/connections", httpConfiguration("source B"), s, c, ""), 200)

	uid := addUser(t, a, "dual@example.test", s.Teams[0].ID, "member")
	joinFixture(t, a, pa.ID, uid, "viewer")
	joinFixture(t, a, pb.ID, uid, "developer")
	us, uc := login(t, a, "dual@example.test")

	denied := frozenUpload(t, uid, pa.ID, connA, "history", "project")
	configurationData[any](t, configurationRequest(t, a, "POST", baseA+"/record-uploads", denied, us, uc, ""), 403)

	accepted := frozenUpload(t, uid, pb.ID, connB, "history", "project")
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", baseB+"/record-uploads", accepted, us, uc, ""), 200)

	configurationData[any](t, configurationRequest(t, a, "GET", baseA+"/records/"+accepted.TargetID, nil, us, uc, ""), 404)
	listed := configurationData[wire.RecordPage](t, configurationRequest(t, a, "GET", baseA+"/records?kind=history", nil, us, uc, ""), 200)
	for _, record := range listed.Items {
		if record.ID == accepted.TargetID {
			t.Fatalf("project A leaked project B record: %+v", record)
		}
	}
}
