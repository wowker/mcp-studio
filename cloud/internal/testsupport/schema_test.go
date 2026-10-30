package testsupport

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func TestActualConnectionIdentityCheckedBeforeContact(t *testing.T) {
	raw := "postgres://mcp_studio_app:synthetic@127.0.0.1:55432/mcp_studio_test"
	for _, kind := range []string{"database", "user", "host", "fallback"} {
		t.Run(kind, func(t *testing.T) {
			cfg, err := pgxpool.ParseConfig(raw)
			if err != nil {
				t.Fatal(err)
			}
			switch kind {
			case "database":
				cfg.ConnConfig.Database = "production"
			case "user":
				cfg.ConnConfig.User = "postgres"
			case "host":
				cfg.ConnConfig.Host = "remote.example.test"
			case "fallback":
				cfg.ConnConfig.Fallbacks = append(cfg.ConnConfig.Fallbacks, &pgconn.FallbackConfig{Host: "remote.example.test", Port: 5432})
			}
			var contacts atomic.Int32
			cfg.BeforeConnect = func(context.Context, *pgx.ConnConfig) error {
				contacts.Add(1)
				return errors.New("forbidden synthetic contact")
			}
			db, err := pgxpool.NewWithConfig(context.Background(), cfg)
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			if _, err = CreateSchema(context.Background(), db, raw); err == nil {
				t.Fatal("mismatched actual connection accepted")
			}
			if contacts.Load() != 0 {
				t.Fatal("contacted mismatched actual connection")
			}
		})
	}
}

type cancelAfterCreate struct {
	cancel context.CancelFunc
	schema string
}

func (c *cancelAfterCreate) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if strings.HasPrefix(data.SQL, "CREATE SCHEMA ") {
		c.schema = strings.Trim(strings.TrimPrefix(data.SQL, "CREATE SCHEMA "), `"`)
	}
	return ctx
}
func (c *cancelAfterCreate) TraceQueryEnd(_ context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	if c.schema != "" && data.Err == nil {
		c.cancel()
	}
}
func TestCancellationBetweenCreateAndClaimRollsBack(t *testing.T) {
	raw := os.Getenv("MCP_STUDIO_TEST_DATABASE_URL")
	if raw == "" {
		t.Fatal("real test database required")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	trace := &cancelAfterCreate{cancel: cancel}
	cfg, err := pgxpool.ParseConfig(raw)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.Tracer = trace
	db, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = CreateSchema(ctx, db, raw); err == nil {
		t.Fatal("interrupted claim committed")
	}
	if trace.schema == "" {
		t.Fatal("did not reach CREATE SCHEMA")
	}
	inspect, err := pgxpool.New(context.Background(), raw)
	if err != nil {
		t.Fatal(err)
	}
	defer inspect.Close()
	var count int
	if err = inspect.QueryRow(context.Background(), `SELECT count(*) FROM pg_namespace WHERE nspname=$1`, trace.schema).Scan(&count); err != nil || count != 0 {
		t.Fatal("partial claim leaked", count, err)
	}
}
