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
	if err := db.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&count); err != nil || count != 4 {
		t.Fatal(err, count)
	}
	db2 := database(t)
	if err := migrations.Apply(ctx, db2); err != nil {
		t.Fatal(err)
	}
}
