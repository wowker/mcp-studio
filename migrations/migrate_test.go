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
	if err = db.QueryRow(ctx, `SELECT count(*) FROM schema_migrations`).Scan(&n); err != nil || n != 4 {
		t.Fatal("upgrade failed", err, n)
	}
	db.Exec(ctx, `UPDATE schema_migrations SET digest='wrong' WHERE version=1`)
	if err = Apply(ctx, db); err == nil {
		t.Fatal("modified prior migration accepted")
	}
}

func TestUpgrade003KeepsRecordAndReceiptAndAddsLifecycleOnce(t *testing.T) {
	ctx := context.Background()
	db := isolatedDatabase(t)
	for _, name := range []string{"001_identity_collaboration.sql", "002_configuration_environment.sql", "003_records.sql"} {
		body, err := files.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = db.Exec(ctx, string(body)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(ctx, `CREATE TABLE schema_migrations(version integer PRIMARY KEY,digest text NOT NULL); INSERT INTO users VALUES('upgrade-user','lifecycle@example.test','Member','synthetic-hash',true); INSERT INTO teams VALUES('upgrade-team','Team'); INSERT INTO team_members VALUES('upgrade-team','upgrade-user','owner'); INSERT INTO projects VALUES('upgrade-project','upgrade-team','Project','project'); INSERT INTO project_members VALUES('upgrade-project','upgrade-user','maintainer'); INSERT INTO records(id,project_id,connection_id,owner_id,kind,run_id,source_run_id,visibility,version,created_at,updated_at,body) VALUES('upgrade-record','upgrade-project','connection','upgrade-user','history','run','','project',1,now(),now(),'{}'); INSERT INTO record_operations VALUES('operation','upgrade-project','upgrade-user','connection','upgrade-record','frozen','browser','{}')`); err != nil {
		t.Fatal(err)
	}
	for i, name := range []string{"001_identity_collaboration.sql", "002_configuration_environment.sql", "003_records.sql"} {
		body, _ := files.ReadFile(name)
		if _, err := db.Exec(ctx, `INSERT INTO schema_migrations VALUES($1,$2)`, i+1, fmt.Sprintf("%x", sha256.Sum256(body))); err != nil {
			t.Fatal(err)
		}
	}
	if err := Apply(ctx, db); err != nil {
		t.Fatal(err)
	}
	if err := Apply(ctx, db); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM records WHERE id='upgrade-record' AND archived_at IS NULL`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("upgrade lost record %d %v", n, err)
	}
	if err := db.QueryRow(ctx, `SELECT count(*) FROM record_operations WHERE frozen_digest='frozen'`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("upgrade changed accepted frozen digest %d %v", n, err)
	}
}
