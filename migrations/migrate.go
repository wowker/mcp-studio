package migrations

import (
	"context"
	"crypto/sha256"
	"embed"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed *.sql
var files embed.FS

func Apply(ctx context.Context, db *pgxpool.Pool) error {
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(705143011)`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,digest text NOT NULL)`); err != nil {
		return err
	}
	body, err := files.ReadFile("001_identity_collaboration.sql")
	if err != nil {
		return err
	}
	sum := fmt.Sprintf("%x", sha256.Sum256(body))
	var prior string
	err = tx.QueryRow(ctx, `SELECT digest FROM schema_migrations WHERE version=1`).Scan(&prior)
	if err == nil {
		if prior != sum {
			return fmt.Errorf("migration checksum mismatch")
		}
		return tx.Commit(ctx)
	}
	if _, err = tx.Exec(ctx, string(body)); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations VALUES(1,$1)`, sum); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
