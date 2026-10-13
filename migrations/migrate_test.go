package migrations

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
)

func isolatedDatabase(t *testing.T) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()
	raw := os.Getenv("MCP_STUDIO_TEST_DATABASE_URL")
	if raw == "" {
		t.Fatal("real test database required")
	}
	admin, err := pgxpool.New(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	var b [12]byte
	rand.Read(b[:])
	schema := fmt.Sprintf("test_migration_%x", b)
	if _, err = admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	config, err := pgxpool.ParseConfig(raw)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		db.Close()
		if _, err := admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE"); err != nil {
			t.Error(err)
		}
		admin.Close()
	})
	return db
}
func TestUpgrade001PreservesIdentityAndVerifiesChecksums(t *testing.T) {
	ctx := context.Background()
	db := isolatedDatabase(t)
	body, err := files.ReadFile("001_identity_collaboration.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, string(body)); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `CREATE TABLE schema_migrations(version integer PRIMARY KEY,digest text NOT NULL); INSERT INTO users(id,email,name,password_hash,verified) VALUES('upgrade-user','upgrade@example.test','Upgrade','synthetic-hash',true)`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(ctx, `INSERT INTO schema_migrations VALUES(1,$1)`, fmt.Sprintf("%x", sha256.Sum256(body))); err != nil {
		t.Fatal(err)
	}
	if err = Apply(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err = Apply(ctx, db); err != nil {
		t.Fatal(err)
	}
	var n int
	if err = db.QueryRow(ctx, `SELECT count(*) FROM users WHERE id='upgrade-user'`).Scan(&n); err != nil || n != 1 {
		t.Fatal("upgrade lost M1 identity", err)
	}
	if err = db.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&n); err != nil || n != 2 {
		t.Fatal("upgrade failed", err, n)
	}
	db.Exec(ctx, `UPDATE schema_migrations SET digest='wrong' WHERE version=1`)
	if err = Apply(ctx, db); err == nil {
		t.Fatal("modified prior migration accepted")
	}
}
