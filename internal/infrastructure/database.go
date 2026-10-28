package infrastructure

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
)

// newPool constructs a pgx pool for the given URL without any privilege
// check. All callers — cloud, local and tests — share this construction path;
// privilege enforcement is added by the wrappers below.
func newPool(ctx context.Context, url string) (*pgxpool.Pool, error) {
	if url == "" {
		return nil, fmt.Errorf("database configuration required")
	}
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("database configuration invalid")
	}
	return db, nil
}

// Database is the cloud-edition pool factory. It rejects superuser and
// BYPASSRLS roles at pool creation time because cloud deployments must run
// with a restricted, non-privileged role.
func Database(ctx context.Context, url string) (*pgxpool.Pool, error) {
	db, err := newPool(ctx, url)
	if err != nil {
		return nil, err
	}
	var privileged bool
	if err = db.QueryRow(ctx, `SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user`).Scan(&privileged); err != nil {
		db.Close()
		return nil, fmt.Errorf("database unavailable")
	}
	if privileged {
		db.Close()
		return nil, fmt.Errorf("runtime database role must not be superuser or bypassrls")
	}
	return db, nil
}

// LocalDatabase is the single-binary local-edition pool factory. The local
// edition bootstraps its own PostgreSQL child process and may legitimately
// connect as the role it just created; the cloud-edition privilege check
// does not apply here.
func LocalDatabase(ctx context.Context, url string) (*pgxpool.Pool, error) {
	return newPool(ctx, url)
}
