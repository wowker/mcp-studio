// studio-admin is an offline operator CLI, never an HTTP maintenance endpoint.
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"mcp-studio/internal/infrastructure"
	"mcp-studio/internal/platform"
	"os"
)

func key(path string) ([]byte, error) {
	info, e := os.Lstat(path)
	if e != nil || !info.Mode().IsRegular() || info.Size() > 128 {
		return nil, errors.New("invalid key file")
	}
	f, e := os.Open(path)
	if e != nil {
		return nil, errors.New("key file unavailable")
	}
	defer f.Close()
	b, e := io.ReadAll(io.LimitReader(f, 129))
	if e != nil {
		return nil, errors.New("key file unavailable")
	}
	v, e := base64.StdEncoding.DecodeString(string(b))
	if e != nil || len(v) != 32 {
		return nil, errors.New("invalid key file")
	}
	return v, nil
}
func run(args []string, w io.Writer) error {
	if len(args) == 0 || args[0] != "rotate-backup-key" {
		return errors.New("expected rotate-backup-key")
	}
	f := flag.NewFlagSet("offline", flag.ContinueOnError)
	f.SetOutput(io.Discard)
	old := f.String("old-key-file", "", "")
	next := f.String("new-key-file", "", "")
	confirmed := f.Bool("offline-confirmed", false, "")
	if f.Parse(args[1:]) != nil || f.NArg() != 0 || !*confirmed {
		return errors.New("stop all platform instances and confirm offline maintenance")
	}
	a, e := key(*old)
	if e != nil {
		return e
	}
	defer clear(a)
	b, e := key(*next)
	if e != nil {
		return e
	}
	defer clear(b)
	raw, e := infrastructure.Secret("MCP_STUDIO_DATABASE_URL")
	if e != nil {
		return e
	}
	db, e := infrastructure.Database(context.Background(), raw)
	if e != nil {
		return e
	}
	defer db.Close()
	n, e := platform.RotateBackupKey(context.Background(), db, a, b)
	if e != nil {
		return e
	}
	return json.NewEncoder(w).Encode(map[string]any{"operation": "offline-backup-key-rotation", "records": n, "metadataVersionChanged": false, "restart": "replace mounted platform key before restart; retain old key with pre-rotation disaster backups"})
}
func main() {
	if e := run(os.Args[1:], os.Stdout); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}
}
