package integration

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"mcp-studio/internal/infrastructure"
	"mcp-studio/migrations"
	"os"
	"testing"
)

func database(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("MCP_STUDIO_TEST_DATABASE_URL")
	if url == "" {
		t.Fatal("MCP_STUDIO_TEST_DATABASE_URL is required; integration must not silently skip")
	}
	db, err := infrastructure.Database(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return db
}
func TestFreshMigrationRestart(t *testing.T) {
	db := database(t)
	ctx := context.Background()
	if err := migrations.Apply(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := migrations.Apply(ctx, db); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&count); err != nil || count != 5 {
		t.Fatal(err, count)
	}
	if err := db.QueryRow(ctx, `SELECT count(*) FROM information_schema.tables WHERE table_schema=current_schema() AND table_name IN ('agent_proofs','agent_grants','credential_backups')`).Scan(&count); err != nil || count != 3 {
		t.Fatal("M5 tables missing", err, count)
	}
	if _, err := db.Exec(ctx, `INSERT INTO users VALUES('integration-probe','integration-probe@example.test','Migration probe','synthetic-hash',true); INSERT INTO sessions VALUES('integration-session','integration-probe','synthetic-csrf',now(),now()); INSERT INTO agent_proofs VALUES('integration-proof','integration-session','integration-probe','device','https://example.test',now()+interval '60 seconds'); INSERT INTO agent_grants VALUES('integration-grant','integration-session','integration-probe','device','https://example.test',now()+interval '900 seconds')`); err != nil {
		t.Fatal(err)
	}
	db2 := database(t)
	if err := migrations.Apply(ctx, db2); err != nil {
		t.Fatal(err)
	}
	if err := db2.QueryRow(ctx, `SELECT (SELECT count(*) FROM agent_proofs WHERE digest='integration-proof')+(SELECT count(*) FROM agent_grants WHERE digest='integration-grant')`).Scan(&count); err != nil || count != 2 {
		t.Fatal("restart erased Agent delegation", err, count)
	}
}
