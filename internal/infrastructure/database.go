package infrastructure

import (
	"context"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Database(ctx context.Context, url string) (*pgxpool.Pool, error) {
	if url == "" {
		return nil, fmt.Errorf("database configuration required")
	}
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, fmt.Errorf("database configuration invalid")
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
