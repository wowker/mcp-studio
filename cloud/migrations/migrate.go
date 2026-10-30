package migrations

import (
	"context"
	"crypto/sha256"
	"embed"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"io/fs"
	"strconv"
	"strings"
)

//go:embed *.sql
var files embed.FS

// Apply serializes migration writers and verifies every applied numbered migration.
// A restart may not skip later migrations merely because version 1 already exists.
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
	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		return err
	}
	last := 0
	for _, name := range names {
		version, err := strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		if err != nil || version != last+1 {
			return fmt.Errorf("migration numbering invalid")
		}
		last = version
		body, err := files.ReadFile(name)
		if err != nil {
			return err
		}
		sum := fmt.Sprintf("%x", sha256.Sum256(body))
		var prior string
		err = tx.QueryRow(ctx, `SELECT digest FROM schema_migrations WHERE version=$1`, version).Scan(&prior)
		if err == nil {
			if prior != sum {
				return fmt.Errorf("migration checksum mismatch: version %d", version)
			}
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		if _, err = tx.Exec(ctx, string(body)); err != nil {
			return err
		}
		if _, err = tx.Exec(ctx, `INSERT INTO schema_migrations(version,digest) VALUES($1,$2)`, version, sum); err != nil {
			return err
		}
	}
	var future bool
	if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version>$1)`, last).Scan(&future); err != nil {
		return err
	}
	if future {
		return fmt.Errorf("database migration version newer than binary")
	}
	return tx.Commit(ctx)
}
