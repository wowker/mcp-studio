// Package testsupport owns disposable fixtures, never application database migrations.
package testsupport

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/url"
	"regexp"
	"strings"
)

var parentName = regexp.MustCompile(`^e2e_[a-f0-9]{24}$`)

// CreateSchema atomically creates and claims a fixture. The parent's advisory
// lock serializes creation with closing, so an interrupted child cannot create
// a new fixture after its verifier has started cleanup.
func CreateSchema(ctx context.Context, db *pgxpool.Pool, raw string) (string, error) {
	fail := errors.New("test schema lease unavailable")
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "postgres" && u.Scheme != "postgresql") || u.User == nil || u.User.Username() != "mcp_studio_app" || u.Path != "/mcp_studio_test" || (u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost" && u.Hostname() != "::1") {
		return "", fail
	}
	actual := db.Config().ConnConfig
	if actual.User != "mcp_studio_app" || actual.Database != "mcp_studio_test" || (actual.Host != "127.0.0.1" && actual.Host != "localhost" && actual.Host != "::1") {
		return "", fail
	}
	for _, fallback := range actual.Fallbacks {
		if fallback.Host != "127.0.0.1" && fallback.Host != "localhost" && fallback.Host != "::1" {
			return "", fail
		}
	}
	parent := u.Query().Get("search_path")
	if strings.HasPrefix(parent, "e2e_") && !parentName.MatchString(parent) {
		return "", fail
	}
	nonce := make([]byte, 12)
	if _, err = rand.Read(nonce); err != nil {
		return "", fail
	}
	schema := "test_" + hex.EncodeToString(nonce)
	claim := "mcp-studio-test-standalone:" + schema
	tx, err := db.Begin(ctx)
	if err != nil {
		return "", fail
	}
	defer tx.Rollback(ctx)
	var role string
	var privileged bool
	if err = tx.QueryRow(ctx, `SELECT current_user,rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user`).Scan(&role, &privileged); err != nil || role != "mcp_studio_app" || privileged {
		return "", fail
	}
	if parentName.MatchString(parent) {
		if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, parent); err != nil {
			return "", fail
		}
		var active bool
		if err = tx.QueryRow(ctx, `SELECT nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND obj_description(oid,'pg_namespace')=$2 FROM pg_namespace WHERE nspname=$1`, parent, "mcp-studio-test-run:"+parent).Scan(&active); err != nil || !active {
			return "", fail
		}
		schema = "test_" + strings.TrimPrefix(parent, "e2e_") + "_" + hex.EncodeToString(nonce)
		claim = "mcp-studio-test-child:" + parent
	}
	if _, err = tx.Exec(ctx, "CREATE SCHEMA "+pgx.Identifier{schema}.Sanitize()); err != nil {
		return "", fail
	}
	if _, err = tx.Exec(ctx, "COMMENT ON SCHEMA "+pgx.Identifier{schema}.Sanitize()+" IS '"+claim+"'"); err != nil {
		return "", fail
	}
	if err = tx.Commit(ctx); err != nil {
		return "", fail
	}
	return schema, nil
}
