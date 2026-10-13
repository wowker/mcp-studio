package platform

import (
	"bytes"
	"context"
	"mcp-studio/internal/wire"
	"strings"
	"testing"
)

func TestOfflineBackupRotationAtomicAndPreservesUserVersion(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "rotation")
	old := bytes.Repeat([]byte{4}, 32)
	next := bytes.Repeat([]byte{5}, 32)
	a.Config.BackupKey = old
	var saved []wire.CredentialBackup
	var routes []string
	for _, name := range []string{"first", "second"} {
		conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+p.ID+"/connections", httpConfiguration(name), s, c, ""), 200)
		path := "/api/v1/projects/" + p.ID + "/connections/" + conn.ID + "/credential-backups"
		input := wire.CredentialBackupInput{Confirmed: true, Password: "fixture-password-123", Kind: "token", ValueJSON: `{"token":"rotation-fixture","n":0}`, SourceDigest: strings.Repeat("a", 64)}
		saved = append(saved, configurationData[wire.CredentialBackup](t, configurationRequest(t, a, "POST", path, input, s, c, ""), 200))
		routes = append(routes, path)
	}
	if saved[0].ID > saved[1].ID {
		saved[0], saved[1] = saved[1], saved[0]
		routes[0], routes[1] = routes[1], routes[0]
	}
	var before []byte
	a.DB.QueryRow(context.Background(), `SELECT ciphertext FROM credential_backups WHERE id=$1`, saved[0].ID).Scan(&before)
	if _, err := RotateBackupKey(context.Background(), a.DB, next, old); err == nil {
		t.Fatal("wrong old key accepted")
	}
	var after []byte
	a.DB.QueryRow(context.Background(), `SELECT ciphertext FROM credential_backups WHERE id=$1`, saved[0].ID).Scan(&after)
	if !bytes.Equal(before, after) {
		t.Fatal("failure changed ciphertext")
	}
	var originalSecond []byte
	a.DB.QueryRow(context.Background(), `SELECT ciphertext FROM credential_backups WHERE id=$1`, saved[1].ID).Scan(&originalSecond)
	a.DB.Exec(context.Background(), `UPDATE credential_backups SET ciphertext='bad'::bytea WHERE id=$1`, saved[1].ID)
	if _, err := RotateBackupKey(context.Background(), a.DB, old, next); err == nil {
		t.Fatal("corrupt backup accepted")
	}
	a.DB.QueryRow(context.Background(), `SELECT ciphertext FROM credential_backups WHERE id=$1`, saved[0].ID).Scan(&after)
	if !bytes.Equal(before, after) {
		t.Fatal("partial rotation committed")
	}
	a.DB.Exec(context.Background(), `UPDATE credential_backups SET ciphertext=$2 WHERE id=$1`, saved[1].ID, originalSecond)
	count, err := RotateBackupKey(context.Background(), a.DB, old, next)
	if err != nil || count != 2 {
		t.Fatal("rotation failed", count, err)
	}
	a.Config.BackupKey = next
	for i, b := range saved {
		got := configurationData[wire.CredentialBackupSecret](t, configurationRequest(t, a, "POST", routes[i]+"/"+b.ID+"/restore", wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"}, s, c, ""), 200)
		metadata := configurationData[[]wire.CredentialBackup](t, configurationRequest(t, a, "GET", routes[i], nil, s, c, ""), 200)
		if len(metadata) != 1 || metadata[0].Version != b.Version || got.ValueJSON != `{"token":"rotation-fixture","n":0}` {
			t.Fatal("rotation changed user content/version")
		}
	}
	if _, err := RotateBackupKey(context.Background(), a.DB, next, next); err == nil {
		t.Fatal("same key is not a rotation")
	}
}
