package platform

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/wire"
	"net/http"
	"time"
)

func (a *App) credentialRoutes(m *http.ServeMux) {
	p := "/api/v1/projects/{projectId}/connections/{connectionId}/credential-backups"
	m.HandleFunc("GET "+p, a.listCredentialBackups)
	m.HandleFunc("POST "+p, a.saveCredentialBackup)
	m.HandleFunc("DELETE "+p+"/{backupId}", a.deleteCredentialBackup)
	m.HandleFunc("POST "+p+"/{backupId}/restore", a.restoreCredentialBackup)
}
func (a *App) backupCipher() (cipher.AEAD, error) {
	if len(a.Config.BackupKey) != 32 {
		return nil, fmt.Errorf("backup unavailable")
	}
	block, err := aes.NewCipher(a.Config.BackupKey)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
func backupAAD(owner, pid, cid string, b wire.CredentialBackup) []byte {
	raw, _ := json.Marshal([]any{"mcp-studio-backup-v1", owner, pid, cid, b.ID, b.Kind, b.ReferenceID, b.SourceDigest, b.Version})
	return raw
}

// Both backup mutations and recovery hold the membership lock, current user
// password lock and parent session lock until commit. No password or secret is
// written to metadata, audit reasons, logs or error messages.
func (a *App) backupTx(w http.ResponseWriter, r *http.Request, execute bool) (pgx.Tx, wire.User, projectAccess, bool) {
	if _, err := a.backupCipher(); execute && err != nil {
		fail(w, 503, "backup_unavailable")
		return nil, wire.User{}, projectAccess{}, false
	}
	tx, u, scope, ok := a.configurationTx(w, r, false, execute)
	if !ok {
		return nil, u, scope, false
	}
	if agentFrom(r) == nil {
		c, _ := r.Cookie(a.cookieName())
		var created, last time.Time
		err := tx.QueryRow(r.Context(), `SELECT created_at,last_seen FROM sessions WHERE digest=$1 AND user_id=$2 FOR UPDATE`, digest(c.Value), u.ID).Scan(&created, &last)
		if err != nil || !a.Now().Before(last.Add(a.Config.Idle)) || !a.Now().Before(created.Add(a.Config.Absolute)) {
			tx.Rollback(r.Context())
			fail(w, 401, "session_expired")
			return nil, u, scope, false
		}
	}
	if _, err := connectionValue(r.Context(), tx, r.PathValue("projectId"), r.PathValue("connectionId")); err != nil {
		tx.Rollback(r.Context())
		configurationFailure(w, err)
		return nil, u, scope, false
	}
	return tx, u, scope, true
}
func (a *App) backupReauth(w http.ResponseWriter, r *http.Request, tx pgx.Tx, uid, password string, confirmed bool) bool {
	if !confirmed {
		fail(w, 400, "backup_confirmation_required")
		return false
	}
	if !a.throttle(r) {
		fail(w, 429, "rate_limited")
		return false
	}
	var hash []byte
	var verified bool
	err := tx.QueryRow(r.Context(), `SELECT password_hash,verified FROM users WHERE id=$1 FOR SHARE`, uid).Scan(&hash, &verified)
	if err != nil {
		dbFailure(w, err)
		return false
	}
	if !verified || len(password) > 72 || bcrypt.CompareHashAndPassword(hash, []byte(password)) != nil {
		fail(w, 403, "reauthentication_failed")
		return false
	}
	return true
}

const backupColumns = `id,kind,reference_id,source_digest,version,created_at,updated_at`

func scanBackup(row pgx.Row) (wire.CredentialBackup, error) {
	var b wire.CredentialBackup
	var created, updated time.Time
	err := row.Scan(&b.ID, &b.Kind, &b.ReferenceID, &b.SourceDigest, &b.Version, &created, &updated)
	b.CreatedAt = created.UTC().Format(time.RFC3339Nano)
	b.UpdatedAt = updated.UTC().Format(time.RFC3339Nano)
	return b, err
}
func (a *App) listCredentialBackups(w http.ResponseWriter, r *http.Request) {
	tx, u, _, ok := a.backupTx(w, r, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	rows, err := tx.Query(r.Context(), `SELECT `+backupColumns+` FROM credential_backups WHERE owner_id=$1 AND project_id=$2 AND connection_id=$3 ORDER BY id`, u.ID, r.PathValue("projectId"), r.PathValue("connectionId"))
	if err != nil {
		dbFailure(w, err)
		return
	}
	items := []wire.CredentialBackup{}
	for rows.Next() {
		b, err := scanBackup(rows)
		if err != nil {
			rows.Close()
			dbFailure(w, err)
			return
		}
		items = append(items, b)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		dbFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, items, "")
}
func (a *App) saveCredentialBackup(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.backupTx(w, r, true)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	var in wire.CredentialBackupInput
	if !decode(w, r, &in) {
		return
	}
	if !a.backupReauth(w, r, tx, u.ID, in.Password, in.Confirmed) {
		return
	}
	if !oneOf(in.Kind, "token", "oauth", "variable") || len(in.ValueJSON) > 32<<10 || in.ExpectedVersion < 0 || len(in.SourceDigest) != 64 {
		fail(w, 400, "invalid_backup")
		return
	}
	for _, c := range in.SourceDigest {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			fail(w, 400, "invalid_backup")
			return
		}
	}
	if _, err := recording.Parse(in.ValueJSON, true); err != nil {
		fail(w, 400, "invalid_backup_json")
		return
	}
	pid, cid := r.PathValue("projectId"), r.PathValue("connectionId")
	if in.Kind == "variable" {
		conn, err := connectionValue(r.Context(), tx, pid, cid)
		if err != nil {
			configurationFailure(w, err)
			return
		}
		defs, code := connectionEffectiveDefinitions(r.Context(), tx, pid, cid, conn.EnvironmentID)
		valid := false
		for _, v := range defs {
			if v.ID == in.ReferenceID && v.Sensitive {
				valid = true
			}
		}
		if code != "" {
			fail(w, 503, code)
			return
		}
		if !valid {
			fail(w, 400, "invalid_backup_reference")
			return
		}
	} else if in.ReferenceID != "" {
		fail(w, 400, "invalid_backup_reference")
		return
	}
	b, err := scanBackup(tx.QueryRow(r.Context(), `SELECT `+backupColumns+` FROM credential_backups WHERE owner_id=$1 AND project_id=$2 AND connection_id=$3 AND kind=$4 AND reference_id=$5 FOR UPDATE`, u.ID, pid, cid, in.Kind, in.ReferenceID))
	fresh := err == pgx.ErrNoRows
	if err != nil && !fresh {
		dbFailure(w, err)
		return
	}
	now := a.Now().UTC().Format(time.RFC3339Nano)
	if fresh {
		if in.ExpectedVersion != 0 {
			fail(w, 409, "version_conflict")
			return
		}
		b = wire.CredentialBackup{ID: id(), Kind: in.Kind, ReferenceID: in.ReferenceID, Version: 1, CreatedAt: now}
	} else {
		if in.ExpectedVersion != b.Version {
			fail(w, 409, "version_conflict")
			return
		}
		b.Version++
	}
	b.SourceDigest = in.SourceDigest
	b.UpdatedAt = now
	aead, _ := a.backupCipher()
	nonce := make([]byte, aead.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		fail(w, 503, "backup_encryption_unavailable")
		return
	}
	sealed := aead.Seal(nil, nonce, []byte(in.ValueJSON), backupAAD(u.ID, pid, cid, b))
	if fresh {
		_, err = tx.Exec(r.Context(), `INSERT INTO credential_backups VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, b.ID, u.ID, pid, cid, b.Kind, b.ReferenceID, b.SourceDigest, b.Version, nonce, sealed, b.CreatedAt, b.UpdatedAt)
	} else {
		_, err = tx.Exec(r.Context(), `UPDATE credential_backups SET source_digest=$2,version=$3,nonce=$4,ciphertext=$5,updated_at=$6 WHERE id=$1`, b.ID, b.SourceDigest, b.Version, nonce, sealed, b.UpdatedAt)
	}
	if err == nil {
		err = audit(r.Context(), tx, scope.teamID, pid, u.ID, "credential.backup.saved", b.ID, "")
	}
	if err != nil {
		dbFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, b, configurationETag(b.ID, b.Version))
}
func (a *App) restoreCredentialBackup(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.backupTx(w, r, true)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	var in wire.CredentialBackupRestoreInput
	if !decode(w, r, &in) {
		return
	}
	if !a.backupReauth(w, r, tx, u.ID, in.Password, in.Confirmed) {
		return
	}
	pid, cid := r.PathValue("projectId"), r.PathValue("connectionId")
	b, err := scanBackup(tx.QueryRow(r.Context(), `SELECT `+backupColumns+` FROM credential_backups WHERE id=$1 AND owner_id=$2 AND project_id=$3 AND connection_id=$4 FOR UPDATE`, r.PathValue("backupId"), u.ID, pid, cid))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if b.Kind == "variable" {
		conn, err := connectionValue(r.Context(), tx, pid, cid)
		if err != nil {
			configurationFailure(w, err)
			return
		}
		defs, code := connectionEffectiveDefinitions(r.Context(), tx, pid, cid, conn.EnvironmentID)
		valid := false
		for _, v := range defs {
			if v.ID == b.ReferenceID && v.Sensitive {
				valid = true
			}
		}
		if code != "" || !valid {
			fail(w, 403, "backup_reference_unavailable")
			return
		}
	}
	var nonce, sealed []byte
	if err = tx.QueryRow(r.Context(), `SELECT nonce,ciphertext FROM credential_backups WHERE id=$1`, b.ID).Scan(&nonce, &sealed); err != nil {
		dbFailure(w, err)
		return
	}
	aead, _ := a.backupCipher()
	if len(nonce) != aead.NonceSize() {
		fail(w, 503, "backup_decryption_unavailable")
		return
	}
	plain, err := aead.Open(nil, nonce, sealed, backupAAD(u.ID, pid, cid, b))
	if err != nil {
		fail(w, 503, "backup_decryption_unavailable")
		return
	}
	if err = audit(r.Context(), tx, scope.teamID, pid, u.ID, "credential.backup.restored", b.ID, ""); err != nil {
		dbFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, wire.CredentialBackupSecret{Kind: b.Kind, ReferenceID: b.ReferenceID, SourceDigest: b.SourceDigest, ValueJSON: string(plain)}, "")
}
func (a *App) deleteCredentialBackup(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.backupTx(w, r, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	b, err := scanBackup(tx.QueryRow(r.Context(), `SELECT `+backupColumns+` FROM credential_backups WHERE id=$1 AND owner_id=$2 AND project_id=$3 AND connection_id=$4 FOR UPDATE`, r.PathValue("backupId"), u.ID, r.PathValue("projectId"), r.PathValue("connectionId")))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM credential_backups WHERE id=$1`, b.ID); err == nil {
		err = audit(r.Context(), tx, scope.teamID, r.PathValue("projectId"), u.ID, "credential.backup.deleted", b.ID, "")
	}
	if err != nil {
		dbFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, wire.Accepted{Ok: true}, "")
}
