package platform

import (
	"bytes"
	"context"
	"encoding/json"
	"mcp-studio/internal/wire"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCredentialBackupEncryptionOwnershipReauthAndMembershipDeletion(t *testing.T) {
	a, m := testApp(t)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "backup")
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+p.ID+"/connections", httpConfiguration("backup"), s, c, ""), 200)
	base := "/api/v1/projects/" + p.ID + "/connections/" + conn.ID + "/credential-backups"
	input := wire.CredentialBackupInput{Confirmed: true, Password: "fixture-password-123", Kind: "token", ReferenceID: "", ValueJSON: `{"token":"fixture-secret-sentinel","zero":0,"disabled":false,"nil":null}`, SourceDigest: strings.Repeat("a", 64)}
	configurationData[any](t, configurationRequest(t, a, "POST", base, input, s, c, ""), 503)
	a.Config.BackupKey = bytes.Repeat([]byte{1}, 32)
	wrong := input
	wrong.Password = "wrong"
	configurationData[any](t, configurationRequest(t, a, "POST", base, wrong, s, c, ""), 403)
	wrong = input
	wrong.Confirmed = false
	configurationData[any](t, configurationRequest(t, a, "POST", base, wrong, s, c, ""), 400)
	saved := configurationData[wire.CredentialBackup](t, configurationRequest(t, a, "POST", base, input, s, c, ""), 200)
	var cipher, nonce []byte
	if err := a.DB.QueryRow(context.Background(), `SELECT ciphertext,nonce FROM credential_backups WHERE id=$1`, saved.ID).Scan(&cipher, &nonce); err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(cipher, []byte("fixture-secret-sentinel")) || len(nonce) != 12 {
		t.Fatal("plaintext or invalid nonce")
	}
	list := configurationRequest(t, a, "GET", base, nil, s, c, "")
	configurationData[[]wire.CredentialBackup](t, list, 200)
	if strings.Contains(list.Body.String(), "fixture-secret-sentinel") || strings.Contains(list.Body.String(), "valueJSON") {
		t.Fatal("list exposed secret")
	}
	restore := wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"}
	got := configurationData[wire.CredentialBackupSecret](t, configurationRequest(t, a, "POST", base+"/"+saved.ID+"/restore", restore, s, c, ""), 200)
	if got.ValueJSON != input.ValueJSON {
		t.Fatal("restore changed JSON")
	}
	configurationData[any](t, configurationRequest(t, a, "POST", base, input, s, c, ""), 409)
	input.ExpectedVersion = 1
	updated := configurationData[wire.CredentialBackup](t, configurationRequest(t, a, "POST", base, input, s, c, ""), 200)
	if updated.Version != 2 {
		t.Fatal("version")
	}
	var nonce2 []byte
	a.DB.QueryRow(context.Background(), `SELECT nonce FROM credential_backups WHERE id=$1`, saved.ID).Scan(&nonce2)
	if bytes.Equal(nonce, nonce2) {
		t.Fatal("nonce reused")
	}
	a.Config.BackupKey = bytes.Repeat([]byte{2}, 32)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/"+saved.ID+"/restore", restore, s, c, ""), 503)
	a.Config.BackupKey = bytes.Repeat([]byte{1}, 32)
	uid := addUser(t, a, "backup-other@example.test", p.TeamID, "member")
	a.DB.Exec(context.Background(), `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid)
	other, otherC := login(t, a, "backup-other@example.test")
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/"+saved.ID+"/restore", restore, other, otherC, ""), 404)
	own := configurationData[wire.CredentialBackup](t, configurationRequest(t, a, "POST", base, wrongBackup(input), other, otherC, ""), 200)
	a.DB.Exec(context.Background(), `UPDATE project_members SET role='viewer' WHERE project_id=$1 AND user_id=$2`, p.ID, uid)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/"+own.ID+"/restore", restore, other, otherC, ""), 403)
	a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, uid)
	a.DB.Exec(context.Background(), `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/"+own.ID+"/restore", restore, other, otherC, ""), 404)
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", base+"/"+saved.ID, nil, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/"+saved.ID+"/restore", restore, s, c, ""), 404)
}
func wrongBackup(v wire.CredentialBackupInput) wire.CredentialBackupInput {
	v.ExpectedVersion = 0
	return v
}

func TestCredentialBackupRestoreWaitsForRoleRevocation(t *testing.T) {
	a, m := testApp(t)
	a.Config.BackupKey = bytes.Repeat([]byte{1}, 32)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "backup-race")
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+p.ID+"/connections", httpConfiguration("backup"), s, c, ""), 200)
	uid := addUser(t, a, "restore@example.test", p.TeamID, "member")
	ctx := context.Background()
	if _, err := a.DB.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	dev, dc := login(t, a, "restore@example.test")
	base := "/api/v1/projects/" + p.ID + "/connections/" + conn.ID + "/credential-backups"
	saved := configurationData[wire.CredentialBackup](t, configurationRequest(t, a, "POST", base, wire.CredentialBackupInput{Confirmed: true, Password: "fixture-password-123", Kind: "token", ValueJSON: `{"token":"fixture-sensitive-race"}`, SourceDigest: strings.Repeat("a", 64)}, dev, dc, ""), 200)
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err = lockTeamTx(ctx, tx, p.TeamID); err != nil {
		t.Fatal(err)
	}
	completed := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		completed <- configurationRequest(t, a, "POST", base+"/"+saved.ID+"/restore", wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"}, dev, dc, "")
	}()
	deadline := time.After(3 * time.Second)
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	waiting := false
	for !waiting {
		select {
		case <-deadline:
			tx.Rollback(ctx)
			<-completed
			t.Fatal("restore did not wait for membership lock")
		case w := <-completed:
			t.Fatalf("restore bypassed membership lock %d", w.Code)
		case <-ticker.C:
			if err = a.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.wait_event_type='Lock' AND a.query='SELECT id FROM teams WHERE id=$1 FOR UPDATE' AND a.pid IN (SELECT pid FROM pg_locks WHERE relation='teams'::regclass))`).Scan(&waiting); err != nil {
				tx.Rollback(ctx)
				<-completed
				t.Fatal(err)
			}
		}
	}
	if _, err = tx.Exec(ctx, `UPDATE project_members SET role='viewer' WHERE project_id=$1 AND user_id=$2`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	w := <-completed
	configurationData[any](t, w, 403)
	if strings.Contains(w.Body.String(), "fixture-sensitive-race") {
		t.Fatal("revoked restore leaked secret")
	}
}
func TestCredentialBackupRealRemovalAPIsPurgeOnlineCopiesAndSafeAudit(t *testing.T) {
	for _, scope := range []string{"project", "team"} {
		t.Run(scope, func(t *testing.T) {
			a, m := testApp(t)
			a.Config.BackupKey = bytes.Repeat([]byte{1}, 32)
			s, c := owner(t, a, m)
			p := createProject(t, a, s, c, "backup-remove")
			conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+p.ID+"/connections", httpConfiguration("backup"), s, c, ""), 200)
			uid := addUser(t, a, "removed@example.test", p.TeamID, "member")
			ctx := context.Background()
			a.DB.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid)
			dev, dc := login(t, a, "removed@example.test")
			base := "/api/v1/projects/" + p.ID + "/connections/" + conn.ID + "/credential-backups"
			saved := configurationData[wire.CredentialBackup](t, configurationRequest(t, a, "POST", base, wire.CredentialBackupInput{Confirmed: true, Password: "fixture-password-123", Kind: "oauth", ValueJSON: `{"accessToken":"fixture-remove-secret"}`, SourceDigest: strings.Repeat("a", 64)}, dev, dc, ""), 200)
			path := "/api/v1/projects/" + p.ID + "/members/" + uid
			if scope == "team" {
				path = "/api/v1/teams/" + p.TeamID + "/members/" + uid
			}
			configurationData[any](t, configurationRequest(t, a, "DELETE", path, nil, s, c, ""), 200)
			var n int
			if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM credential_backups WHERE id=$1`, saved.ID).Scan(&n); err != nil || n != 0 {
				t.Fatal("online backup survived removal", err)
			}
			if scope == "team" {
				a.DB.Exec(ctx, `INSERT INTO team_members VALUES($1,$2,'member')`, p.TeamID, uid)
			}
			a.DB.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid)
			configurationData[any](t, configurationRequest(t, a, "POST", base+"/"+saved.ID+"/restore", wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"}, dev, dc, ""), 404)
			var auditBody string
			a.DB.QueryRow(ctx, `SELECT string_agg(action||target_id||reason,' ') FROM audits WHERE actor_id=$1`, uid).Scan(&auditBody)
			if strings.Contains(auditBody, "fixture-remove-secret") || strings.Contains(auditBody, "fixture-password-123") {
				t.Fatal("audit contained credentials")
			}
		})
	}
}
func TestCredentialBackupReferenceValidationCipherBindingAndWriteFailure(t *testing.T) {
	a, m := testApp(t)
	a.Config.BackupKey = bytes.Repeat([]byte{1}, 32)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "backup-reference")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("backup"), s, c, ""), 200)
	path := base + "/connections/" + conn.ID + "/credential-backups"
	in := wire.CredentialBackupInput{Confirmed: true, Password: "fixture-password-123", Kind: "variable", ReferenceID: "missing", SourceDigest: strings.Repeat("a", 64), ValueJSON: `null`}
	configurationData[any](t, configurationRequest(t, a, "POST", path, in, s, c, ""), 400)
	ctx := context.Background()
	vid := id()
	if _, err := a.DB.Exec(ctx, `INSERT INTO variables(id,project_id,connection_id,name,type,sensitive,required,value_json) VALUES($1,$2,$3,'SECRET','string',true,false,'')`, vid, p.ID, conn.ID); err != nil {
		t.Fatal(err)
	}
	in.ReferenceID = vid
	in.ValueJSON = `{"ambiguous":1,"ambiguous":2}`
	configurationData[any](t, configurationRequest(t, a, "POST", path, in, s, c, ""), 400)
	in.ValueJSON = `"fixture-variable-value"`
	b := configurationData[wire.CredentialBackup](t, configurationRequest(t, a, "POST", path, in, s, c, ""), 200)
	if _, err := a.DB.Exec(ctx, `UPDATE credential_backups SET version=version+1 WHERE id=$1`, b.ID); err != nil {
		t.Fatal(err)
	}
	configurationData[any](t, configurationRequest(t, a, "POST", path+"/"+b.ID+"/restore", wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"}, s, c, ""), 503)
	a.DB.Exec(ctx, `UPDATE credential_backups SET version=version-1 WHERE id=$1`, b.ID)
	a.DB.Exec(ctx, `UPDATE variables SET sensitive=false,value_json='"public"' WHERE id=$1`, vid)
	configurationData[any](t, configurationRequest(t, a, "POST", path+"/"+b.ID+"/restore", wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"}, s, c, ""), 403)
	if _, err := a.DB.Exec(ctx, `CREATE FUNCTION fail_backup_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'storage unavailable'; END $$; CREATE TRIGGER backup_failure BEFORE UPDATE ON credential_backups FOR EACH ROW EXECUTE FUNCTION fail_backup_update()`); err != nil {
		t.Fatal(err)
	}
	a.DB.Exec(ctx, `UPDATE variables SET sensitive=true,value_json='' WHERE id=$1`, vid)
	in.ExpectedVersion = 1
	in.ValueJSON = `"replacement-value"`
	configurationData[any](t, configurationRequest(t, a, "POST", path, in, s, c, ""), 503)
	original := configurationData[wire.CredentialBackupSecret](t, configurationRequest(t, a, "POST", path+"/"+b.ID+"/restore", wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"}, s, c, ""), 200)
	if original.ValueJSON != `"fixture-variable-value"` {
		t.Fatal("failed update changed existing backup")
	}
}
func TestCredentialBackupAgentRestoreFreshPasswordAndConcurrentVersion(t *testing.T) {
	a, m := testApp(t)
	a.Config.BackupKey = bytes.Repeat([]byte{1}, 32)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "backup-agent")
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+p.ID+"/connections", httpConfiguration("backup"), s, c, ""), 200)
	path := "/api/v1/projects/" + p.ID + "/connections/" + conn.ID + "/credential-backups"
	in := wire.CredentialBackupInput{Confirmed: true, Password: "fixture-password-123", Kind: "token", ValueJSON: `"fixture-agent-restore"`, SourceDigest: strings.Repeat("a", 64)}
	grant := testGrant(t, a, s, c, "device")
	status, b := bearerRequest(t, a, "POST", path, grant, in)
	requireStatus(t, status, 200)
	var saved wire.CredentialBackup
	json.Unmarshal(b, &saved)
	status, b = bearerRequest(t, a, "POST", path+"/"+saved.ID+"/restore", grant, wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"})
	requireStatus(t, status, 200)
	var secret wire.CredentialBackupSecret
	json.Unmarshal(b, &secret)
	if secret.ValueJSON != in.ValueJSON {
		t.Fatal("agent restore wrong value")
	}
	in.ExpectedVersion = 1
	done := make(chan int, 2)
	for i := 0; i < 2; i++ {
		go func() { status, _ := bearerRequest(t, a, "POST", path, grant, in); done <- status }()
	}
	first, second := <-done, <-done
	if !((first == 200 && second == 409) || (second == 200 && first == 409)) {
		t.Fatalf("version overwrite race %d %d", first, second)
	}
	hash, err := passwordHash("new-fixture-password-123")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = a.DB.Exec(context.Background(), `UPDATE users SET password_hash=$1 WHERE id=$2`, hash, s.User.ID); err != nil {
		t.Fatal(err)
	}
	status, _ = bearerRequest(t, a, "POST", path+"/"+saved.ID+"/restore", grant, wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"})
	requireStatus(t, status, 403)
	status, _ = bearerRequest(t, a, "POST", path+"/"+saved.ID+"/restore", grant, wire.CredentialBackupRestoreInput{Confirmed: true, Password: "new-fixture-password-123"})
	requireStatus(t, status, 200)
}
func TestCredentialBackupKeyLossStillAllowsMetadataAndPrivacyDeletion(t *testing.T) {
	a, m := testApp(t)
	a.Config.BackupKey = bytes.Repeat([]byte{1}, 32)
	s, c := owner(t, a, m)
	p := createProject(t, a, s, c, "backup-keyloss")
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+p.ID+"/connections", httpConfiguration("backup"), s, c, ""), 200)
	path := "/api/v1/projects/" + p.ID + "/connections/" + conn.ID + "/credential-backups"
	in := wire.CredentialBackupInput{Confirmed: true, Password: "fixture-password-123", Kind: "token", ValueJSON: `"fixture-delete-without-key"`, SourceDigest: strings.Repeat("a", 64)}
	saved := configurationData[wire.CredentialBackup](t, configurationRequest(t, a, "POST", path, in, s, c, ""), 200)
	a.Config.BackupKey = nil
	metadata := configurationData[[]wire.CredentialBackup](t, configurationRequest(t, a, "GET", path, nil, s, c, ""), 200)
	if len(metadata) != 1 || metadata[0].ID != saved.ID {
		t.Fatal("key loss hid metadata")
	}
	configurationData[any](t, configurationRequest(t, a, "POST", path+"/"+saved.ID+"/restore", wire.CredentialBackupRestoreInput{Confirmed: true, Password: "fixture-password-123"}, s, c, ""), 503)
	configurationData[any](t, configurationRequest(t, a, "POST", path, in, s, c, ""), 503)
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", path+"/"+saved.ID, nil, s, c, ""), 200)
	metadata = configurationData[[]wire.CredentialBackup](t, configurationRequest(t, a, "GET", path, nil, s, c, ""), 200)
	if len(metadata) != 0 {
		t.Fatal("privacy deletion failed")
	}
}
