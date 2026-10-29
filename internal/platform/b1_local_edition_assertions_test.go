//go:build local

package platform

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/wire"
	"mcp-studio/migrations"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// B1 单机版证据（方法论 R3/R4）：同一份业务代码在 apps/local 形态下运行，
// 免登录本地主体、无角色/成员资格校验，但仍必须按项目归属过滤。
// 云版对应断言见 b1_identity_collaboration_assertions_test.go。
//
// 每个测试使用独立 schema（与云版 testApp 同样的隔离方式），
// 避免共享 schema 下的固定夹具行互相清理。

func b1LocalApp(t *testing.T) (app *App, teamID, projectID string) {
	t.Helper()
	databaseURL := os.Getenv("MCP_STUDIO_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("local edition tests need an isolated test database")
	}
	ctx := context.Background()
	root, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(root.Close)

	schema := "b1_local_" + id()
	if _, err := root.Exec(ctx, `CREATE SCHEMA `+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if _, err := root.Exec(context.Background(), `DROP SCHEMA IF EXISTS `+schema+` CASCADE`); err != nil {
			t.Errorf("drop schema: %v", err)
		}
	})
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := migrations.Apply(ctx, pool); err != nil {
		t.Fatal(err)
	}
	// 复用既有单机版夹具（本地主体 + 单个团队 + 单个项目），
	// 额外项目一律走产品接口创建，避免断言自己插入的行。
	if err := prepareLocalFixture(ctx, pool); err != nil {
		t.Fatal(err)
	}

	subject := wire.User{ID: localFixtureUser, Email: "local@fixture.test", Name: "Local Owner", Verified: true}
	teams := []wire.Team{{ID: localFixtureTeam, Name: "Local", Role: "owner"}}
	cfgApp := Config{Origin: "http://127.0.0.1:8080", Idle: 8 * time.Hour, Absolute: 24 * time.Hour}
	app = &App{DB: pool, Now: time.Now, Config: cfgApp}
	app.localSubject = subject
	app.localTeams = teams
	return app, localFixtureTeam, localFixtureProject
}

func b1LocalRequest(t *testing.T, a *App, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	payload := ""
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		payload = string(b)
	}
	r := httptest.NewRequest(method, path, strings.NewReader(payload))
	r.Header.Set("Origin", a.Config.Origin)
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	return w
}

func b1LocalData[T any](t *testing.T, w *httptest.ResponseRecorder, status int) T {
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

// A01 单机版：空名/重名被拒绝，失败后可重试成功，团队内不产生重复项目，
// 创建者为维护者（单机版同样返回维护者关系，用于前端能力加载）。
func TestB1LocalA01ProjectCreationValidationAndRetry(t *testing.T) {
	a, teamID, _ := b1LocalApp(t)
	base := "/api/v1/teams/" + teamID + "/projects"

	b1LocalData[wire.Project](t, b1LocalRequest(t, a, "POST", base, wire.ProjectRequest{Name: "Dup"}), 200)
	b1LocalData[any](t, b1LocalRequest(t, a, "POST", base, wire.ProjectRequest{Name: "   "}), 400)
	b1LocalData[any](t, b1LocalRequest(t, a, "POST", base, wire.ProjectRequest{Name: " dup "}), 409)
	retried := b1LocalData[wire.Project](t, b1LocalRequest(t, a, "POST", base, wire.ProjectRequest{Name: "Retried"}), 200)
	if retried.ID == "" || retried.Role != "maintainer" || !retried.CanRead || !retried.CanManage {
		t.Fatalf("local retry did not create a maintained project: %+v", retried)
	}

	var total, duplicates int
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM projects WHERE team_id=$1`, teamID).Scan(&total)
	a.DB.QueryRow(context.Background(), `SELECT count(*) FROM projects WHERE team_id=$1 AND name_key=$2`, teamID, canonical("Retried")).Scan(&duplicates)
	if total != 3 || duplicates != 1 {
		t.Fatalf("local retry produced duplicates: total=%d duplicates=%d", total, duplicates)
	}
	listed := b1LocalData[[]wire.Project](t, b1LocalRequest(t, a, "GET", base, nil), 200)
	if len(listed) != 3 {
		t.Fatalf("local project list lost entries: %+v", listed)
	}
}

// A02 单机版：两个项目各自的配置与记录按项目归属隔离；
// 读取另一项目的资源仍返回 404，切换不合并数据（R3 项目过滤底线）。
func TestB1LocalA02ProjectScopedDataIsolation(t *testing.T) {
	a, teamID, projectA := b1LocalApp(t)
	base := "/api/v1/teams/" + teamID + "/projects"
	projectB := b1LocalData[wire.Project](t, b1LocalRequest(t, a, "POST", base, wire.ProjectRequest{Name: "Second"}), 200)
	baseA := "/api/v1/projects/" + projectA
	baseB := "/api/v1/projects/" + projectB.ID

	conn := b1LocalData[wire.Connection](t, b1LocalRequest(t, a, "POST", baseB+"/connections", httpConfiguration("local source")), 200)
	upload := frozenUpload(t, localFixtureUser, projectB.ID, conn, "history", "project")
	b1LocalData[wire.RecordOperationReceipt](t, b1LocalRequest(t, a, "POST", baseB+"/record-uploads", upload), 200)

	// 另一项目的资源不可见：连接、记录都以项目路径为边界。
	if got := b1LocalData[[]wire.Connection](t, b1LocalRequest(t, a, "GET", baseA+"/connections", nil), 200); len(got) != 0 {
		t.Fatalf("project A saw project B connections: %+v", got)
	}
	if got := b1LocalData[wire.RecordPage](t, b1LocalRequest(t, a, "GET", baseA+"/records?kind=history", nil), 200); len(got.Items) != 0 {
		t.Fatalf("project A saw project B records: %+v", got.Items)
	}
	b1LocalData[any](t, b1LocalRequest(t, a, "GET", baseA+"/records/"+upload.TargetID, nil), 404)

	// 返回原项目时数据仍完整，未被另一项目覆盖。
	if got := b1LocalData[[]wire.Connection](t, b1LocalRequest(t, a, "GET", baseB+"/connections", nil), 200); len(got) != 1 || got[0].ID != conn.ID {
		t.Fatalf("project B lost its own configuration: %+v", got)
	}
	page := b1LocalData[wire.RecordPage](t, b1LocalRequest(t, a, "GET", baseB+"/records?kind=history", nil), 200)
	if len(page.Items) != 1 || page.Items[0].ID != upload.TargetID || page.Items[0].OwnerID != localFixtureUser {
		t.Fatalf("project B lost its own record: %+v", page.Items)
	}
}
