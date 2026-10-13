package platform

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"mcp-studio/internal/wire"
)

// RotateBackupKey is an offline maintenance operation: all platform instances
// must be stopped. It does not rotate Agent/OS keys or user-visible revisions.
// A corrupt row or wrong old key rolls the entire transaction back.
func RotateBackupKey(ctx context.Context, db *pgxpool.Pool, oldKey, newKey []byte) (int, error) {
	fail := errors.New("backup key rotation failed")
	if len(oldKey) != 32 || len(newKey) != 32 || bytes.Equal(oldKey, newKey) {
		return 0, fail
	}
	a, _ := aes.NewCipher(oldKey)
	old, _ := cipher.NewGCM(a)
	b, _ := aes.NewCipher(newKey)
	next, _ := cipher.NewGCM(b)
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, fail
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `LOCK TABLE credential_backups IN ACCESS EXCLUSIVE MODE`); err != nil {
		return 0, fail
	}
	rows, err := tx.Query(ctx, `SELECT id,owner_id,project_id,connection_id,kind,reference_id,source_digest,version,nonce,ciphertext FROM credential_backups ORDER BY id`)
	if err != nil {
		return 0, fail
	}
	type item struct {
		backup        wire.CredentialBackup
		uid, pid, cid string
		nonce, sealed []byte
	}
	var items []item
	for rows.Next() {
		var i item
		if err = rows.Scan(&i.backup.ID, &i.uid, &i.pid, &i.cid, &i.backup.Kind, &i.backup.ReferenceID, &i.backup.SourceDigest, &i.backup.Version, &i.nonce, &i.sealed); err != nil {
			rows.Close()
			return 0, fail
		}
		items = append(items, i)
	}
	rows.Close()
	if rows.Err() != nil {
		return 0, fail
	}
	for _, i := range items {
		if len(i.nonce) != old.NonceSize() {
			return 0, fail
		}
		aad := backupAAD(i.uid, i.pid, i.cid, i.backup)
		plain, err := old.Open(nil, i.nonce, i.sealed, aad)
		if err != nil {
			return 0, fail
		}
		nonce := make([]byte, next.NonceSize())
		if _, err = rand.Read(nonce); err != nil {
			clear(plain)
			return 0, fail
		}
		sealed := next.Seal(nil, nonce, plain, aad)
		clear(plain)
		if _, err = tx.Exec(ctx, `UPDATE credential_backups SET nonce=$2,ciphertext=$3 WHERE id=$1`, i.backup.ID, nonce, sealed); err != nil {
			return 0, fail
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, fail
	}
	return len(items), nil
}
