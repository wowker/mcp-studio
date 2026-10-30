// A real subprocess that deliberately omits t.Cleanup on interruption/failure.
package main

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5/pgxpool"
	"mcp-studio/internal/testsupport"
	"os"
	"time"
)

func main() {
	if len(os.Args) != 3 {
		os.Exit(2)
	}
	raw := os.Getenv("MCP_STUDIO_TEST_DATABASE_URL")
	db, err := pgxpool.New(context.Background(), raw)
	if err != nil {
		os.Exit(2)
	}
	defer db.Close()
	schema, err := testsupport.CreateSchema(context.Background(), db, raw)
	if err != nil {
		os.Exit(2)
	}
	data, _ := json.Marshal(map[string]any{"schema": schema, "pid": os.Getpid()})
	if os.WriteFile(os.Args[1]+".tmp", data, 0600) != nil || os.Rename(os.Args[1]+".tmp", os.Args[1]) != nil {
		os.Exit(2)
	}
	if os.Args[2] == "fail" {
		os.Exit(7)
	}
	for {
		time.Sleep(time.Second)
	}
}
