//go:build !local

package platform

import (
	"context"
	"mcp-studio/internal/wire"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

type capacityResult struct {
	ProjectID               string `json:"projectId"`
	UsedBytes               int64  `json:"usedBytes"`
	LimitBytes              int64  `json:"limitBytes"`
	ArchivedBytes           int64  `json:"archivedBytes"`
	HistoryRetentionDays    int    `json:"historyRetentionDays"`
	MaxHistoryRetentionDays int    `json:"maxHistoryRetentionDays"`
	Etag                    string `json:"etag"`
	NearLimit               bool   `json:"nearLimit"`
}

func TestRecordCapacityAdmissionAndConditionalRetention(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Capacity")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	cap := configurationData[capacityResult](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, s, c, ""), 200)
	if cap.LimitBytes != 5<<30 || cap.UsedBytes != 0 || cap.HistoryRetentionDays != 90 || cap.MaxHistoryRetentionDays != 90 {
		t.Fatalf("defaults %+v", cap)
	}
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/record-capacity", map[string]int{"historyRetentionDays": 30}, s, c, ""), 428)
	updated := configurationData[capacityResult](t, configurationRequest(t, a, "PATCH", base+"/record-capacity", map[string]int{"historyRetentionDays": 30}, s, c, cap.Etag), 200)
	if updated.HistoryRetentionDays != 30 || updated.Etag == cap.Etag {
		t.Fatalf("retention %+v", updated)
	}
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/record-capacity", map[string]int{"historyRetentionDays": 91}, s, c, updated.Etag), 400)
	input := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 200)
	full := configurationData[capacityResult](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, s, c, ""), 200)
	if full.UsedBytes <= 0 {
		t.Fatal("records not accounted")
	}
	// Set the deployed limit exactly at the authoritative aggregate.
	a.Config.RecordCapacityBytes = full.UsedBytes
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections/"+conn.ID+"/session-access", map[string]any{"version": conn.Version, "environmentId": "", "purpose": "execute"}, s, c, ""), 409)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections/"+conn.ID+"/session-access", map[string]any{"version": conn.Version, "environmentId": ""}, s, c, ""), 200)
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 200)
	next := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", next, s, c, ""), 409)
	var count int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM records WHERE project_id=$1`, p.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("rejected upload persisted %d %v", count, err)
	}
}

func TestRecordArchiveRejoinAndExpiredTombstone(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Archive")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	uid := addUser(t, a, "archived@example.test", s.Teams[0].ID, "member")
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/members/"+uid, wire.MemberRequest{Role: "developer"}, s, c, ""), 200)
	user, uc := login(t, a, "archived@example.test")
	input := frozenUpload(t, uid, p.ID, conn, "saved", "private")
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, user, uc, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/members/"+uid, nil, s, c, ""), 200)
	var archived *time.Time
	if err := a.DB.QueryRow(context.Background(), `SELECT archived_at FROM records WHERE id=$1`, input.TargetID).Scan(&archived); err != nil || archived == nil {
		t.Fatalf("not archived %v", err)
	}
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records/"+input.TargetID, nil, s, c, ""), 404)
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records/"+input.TargetID, nil, user, uc, ""), 403)
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/members/"+uid, wire.MemberRequest{Role: "viewer"}, s, c, ""), 200)
	configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+input.TargetID, nil, user, uc, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, user, uc, ""), 403)
	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/members/"+uid, nil, s, c, ""), 200)
	now := a.Now()
	a.Now = func() time.Time { return now.Add(30 * 24 * time.Hour) }
	s, c = login(t, a, "owner@example.test")
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/members/"+uid, wire.MemberRequest{Role: "developer"}, s, c, ""), 200)
	user, uc = login(t, a, "archived@example.test")
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records/"+input.TargetID, nil, user, uc, ""), 404)
	if err := a.Sweep(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := a.Sweep(context.Background()); err != nil {
		t.Fatal(err)
	}
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, user, uc, ""), 200)
	var count int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM records WHERE id=$1`, input.TargetID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("receipt resurrected record %d %v", count, err)
	}
}

func TestRecordCapacityOneByteBoundaryAndConcurrentWriters(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "ByteBoundary")
	base := "/api/v1/projects/" + p.ID
	ctx := context.Background()
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	input := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 200)
	cap := configurationData[capacityResult](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, s, c, ""), 200)
	// Reset the measurement fixture, preserving the exact frozen upload and clock.
	for _, query := range []string{`DELETE FROM records WHERE project_id=$1`, `DELETE FROM record_operations WHERE project_id=$1`, `DELETE FROM audits WHERE project_id=$1 AND action LIKE 'record.%'`} {
		if _, err := a.DB.Exec(ctx, query, p.ID); err != nil {
			t.Fatal(err)
		}
	}
	a.Config.RecordCapacityBytes = cap.UsedBytes - 1
	rejected := configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, "")
	configurationData[any](t, rejected, 409)
	if !strings.Contains(rejected.Body.String(), "capacity_full") {
		t.Fatalf("wrong rejection %s", rejected.Body.String())
	}
	a.Config.RecordCapacityBytes = cap.UsedBytes
	second := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	outputs := make(chan *httptest.ResponseRecorder, 2)
	for _, in := range []wire.RecordUploadInput{input, second} {
		go func(v wire.RecordUploadInput) {
			outputs <- configurationRequest(t, a, "POST", base+"/record-uploads", v, s, c, "")
		}(in)
	}
	statuses := map[int]int{}
	for i := 0; i < 2; i++ {
		r := <-outputs
		statuses[r.Code]++
		if r.Code != 200 && r.Code != 409 {
			t.Fatalf("unexpected concurrent status %d %s", r.Code, r.Body.String())
		}
	}
	if statuses[200] != 1 || statuses[409] != 1 {
		t.Fatalf("both writers admitted final space: %v", statuses)
	}
	final := configurationData[capacityResult](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, s, c, ""), 200)
	if final.UsedBytes != cap.UsedBytes || !final.NearLimit {
		t.Fatalf("logical byte boundary %+v", final)
	}
	var count int
	if err := a.DB.QueryRow(ctx, `SELECT (SELECT count(*) FROM records)+(SELECT count(*) FROM record_operations)`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("atomic cap %d %v", count, err)
	}
}

func TestRecordSweepHistorySavedPinnedAndReceiptRestart(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Expiry")
	base := "/api/v1/projects/" + p.ID
	ctx := context.Background()
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	ordinary := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	pinned := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	saved := frozenUpload(t, s.User.ID, p.ID, conn, "saved", "private")
	for _, v := range []wire.RecordUploadInput{ordinary, pinned, saved} {
		configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", v, s, c, ""), 200)
	}
	record := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+pinned.TargetID, nil, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/records/"+pinned.TargetID+"/pin", wire.RecordPinInput{Pinned: true}, s, c, record.Etag), 200)
	now := a.Now()
	a.Now = func() time.Time { return now.Add(90*24*time.Hour - time.Nanosecond) }
	if err := a.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM records`).Scan(&count); err != nil || count != 3 {
		t.Fatalf("deleted before boundary %d %v", count, err)
	}
	a.Now = func() time.Time { return now.Add(90 * 24 * time.Hour) }
	// A new App instance models job restart without in-memory lifecycle state.
	restarted := &App{DB: a.DB, Now: a.Now, Config: a.Config}
	if err := restarted.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	if err := restarted.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	s, c = login(t, a, "owner@example.test")
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records/"+ordinary.TargetID, nil, s, c, ""), 404)
	configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+pinned.TargetID, nil, s, c, ""), 200)
	configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+saved.TargetID, nil, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", ordinary, s, c, ""), 200)
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM records WHERE id=$1`, ordinary.TargetID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("expired history recreated %d %v", count, err)
	}
	// A new upload identity cannot reuse a cleared history ID or source proof.
	reupload := ordinary
	reupload.OperationID = id()
	reupload.TargetID = id()
	freezeUpload(t, &reupload)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", reupload, s, c, ""), 409)

	copy := ordinary
	copy.OperationID = id()
	freezeUpload(t, &copy)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", copy, s, c, ""), 409)
	copy = ordinary
	copy.OperationID = id()
	copy.TargetID = id()
	copy.TargetKind = "saved"
	copy.SourceRunID = ordinary.Snapshot.RunID
	freezeUpload(t, &copy)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", copy, s, c, ""), 400)
}

func TestRecordCapacityReadersAndArchiveAggregateIsolation(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Permissions")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	uid := addUser(t, a, "private@example.test", s.Teams[0].ID, "member")
	if _, err := a.DB.Exec(context.Background(), `UPDATE users SET name='Fixture Member' WHERE id=$1`, uid); err != nil {
		t.Fatal(err)
	}
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/members/"+uid, wire.MemberRequest{Role: "developer"}, s, c, ""), 200)
	user, uc := login(t, a, "private@example.test")
	priv := frozenUpload(t, uid, p.ID, conn, "saved", "private")
	pub := frozenUpload(t, uid, p.ID, conn, "history", "project")
	for _, v := range []wire.RecordUploadInput{priv, pub} {
		configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", v, user, uc, ""), 200)
	}
	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/members/"+uid, nil, s, c, ""), 200)
	cap := configurationData[capacityResult](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, s, c, ""), 200)
	if cap.ArchivedBytes <= 0 || cap.ArchivedBytes >= cap.UsedBytes {
		t.Fatalf("archive ledger %+v", cap)
	}
	record := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+pub.TargetID, nil, s, c, ""), 200)
	if record.OwnerID != uid || record.OwnerName != "Fixture Member" {
		t.Fatalf("published attribution lost %+v", record)
	}
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records/"+priv.TargetID+"/audits", nil, s, c, ""), 404)
	adminID := addUser(t, a, "directory@example.test", s.Teams[0].ID, "admin")
	_ = adminID
	admin, ac := login(t, a, "directory@example.test")
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, admin, ac, ""), 403)
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/members/"+uid, wire.MemberRequest{Role: "viewer"}, s, c, ""), 200)
	configurationData[capacityResult](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, user, uc, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/record-capacity", map[string]int{"historyRetentionDays": 1}, user, uc, cap.Etag), 403)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/connections/"+conn.ID+"/session-access", map[string]any{"version": conn.Version, "environmentId": "", "purpose": "execute"}, user, uc, ""), 403)
}

func TestTeamRemovalArchivesAllProjectsAndInvitationRestoresOnlyJoinedProject(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "First")
	p2 := createProject(t, a, s, c, "Second")
	ctx := context.Background()
	uid := addUser(t, a, "returning@example.test", s.Teams[0].ID, "member")
	uploads := []wire.RecordUploadInput{}
	for _, project := range []wire.Project{p, p2} {
		base := "/api/v1/projects/" + project.ID
		joinFixture(t, a, project.ID, uid, "developer")
		conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
		user, uc := login(t, a, "returning@example.test")
		in := frozenUpload(t, uid, project.ID, conn, "saved", "private")
		uploads = append(uploads, in)
		configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", in, user, uc, ""), 200)
	}
	configurationData[any](t, configurationRequest(t, a, "DELETE", "/api/v1/teams/"+s.Teams[0].ID+"/members/"+uid, nil, s, c, ""), 200)
	var count int
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM records WHERE owner_id=$1 AND archived_at IS NOT NULL`, uid).Scan(&count); err != nil || count != 2 {
		t.Fatalf("team archive %d %v", count, err)
	}
	now := a.Now()
	a.Now = func() time.Time { return now.Add(30*24*time.Hour - time.Microsecond) }
	s, c = login(t, a, "owner@example.test")
	inv := invite(t, a, s, c, p, "returning@example.test", "member")
	tok := mail.lastCode()
	user, uc := login(t, a, "returning@example.test")
	status, _, _ := request(t, a, "POST", "/api/v1/invitations/"+inv.ID+"/accept", wire.TokenRequest{Token: tok}, &user, uc)
	requireStatus(t, status, 200)
	configurationData[wire.Record](t, configurationRequest(t, a, "GET", "/api/v1/projects/"+p.ID+"/records/"+uploads[0].TargetID, nil, user, uc, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "GET", "/api/v1/projects/"+p2.ID+"/records/"+uploads[1].TargetID, nil, user, uc, ""), 403)
	// At the exact archive boundary, rejoining another project deletes its bodies
	// synchronously even if the periodic job has not run.
	a.Now = func() time.Time { return now.Add(30 * 24 * time.Hour) }
	inv2 := invite(t, a, s, c, p2, "returning@example.test", "member")
	tok = mail.lastCode()
	status, _, _ = request(t, a, "POST", "/api/v1/invitations/"+inv2.ID+"/accept", wire.TokenRequest{Token: tok}, &user, uc)
	requireStatus(t, status, 200)
	configurationData[any](t, configurationRequest(t, a, "GET", "/api/v1/projects/"+p2.ID+"/records/"+uploads[1].TargetID, nil, user, uc, ""), 404)
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM records WHERE id=$1`, uploads[1].TargetID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("expired invitation restored private body %d %v", count, err)
	}
}

func TestRecordEffectiveRetentionClampsWhenDeploymentMaximumShrinks(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "DeployRetention")
	base := "/api/v1/projects/" + p.ID
	ctx := context.Background()
	a.Config.MaxHistoryRetentionDays = 180
	cap := configurationData[capacityResult](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, s, c, ""), 200)
	policy := configurationData[capacityResult](t, configurationRequest(t, a, "PATCH", base+"/record-capacity", map[string]int{"historyRetentionDays": 180}, s, c, cap.Etag), 200)
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	input := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 200)
	a.Config.MaxHistoryRetentionDays = 30
	effective := configurationData[capacityResult](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, s, c, ""), 200)
	if effective.HistoryRetentionDays != 30 || effective.Etag != policy.Etag {
		t.Fatalf("deployment max not effective or policy etag changed %+v", effective)
	}
	now := a.Now()
	a.Now = func() time.Time { return now.Add(30 * 24 * time.Hour) }
	if err := a.Sweep(ctx); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := a.DB.QueryRow(ctx, `SELECT count(*) FROM records WHERE id=$1`, input.TargetID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("cleanup ignored deployment max %d %v", count, err)
	}
}

func TestAdditionalRedactionUpdatesArchivedCopiesWithoutRevealingIdentity(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "ArchiveRedaction")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	source := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	source.Snapshot.RequestJSON = `{"business":"ARCHIVED_CONFIDENTIAL","n":0}`
	source.Snapshot.ResponseJSON = `{"echo":"ARCHIVED_CONFIDENTIAL"}`
	freezeUpload(t, &source)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", source, s, c, ""), 200)
	history := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+source.TargetID, nil, s, c, ""), 200)
	uid := addUser(t, a, "copy@example.test", s.Teams[0].ID, "member")
	joinFixture(t, a, p.ID, uid, "developer")
	user, uc := login(t, a, "copy@example.test")
	saved := frozenUpload(t, uid, p.ID, conn, "saved", "private")
	saved.SourceRunID = history.Snapshot.RunID
	saved.Snapshot = history.Snapshot
	freezeUpload(t, &saved)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", saved, user, uc, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/members/"+uid, nil, s, c, ""), 200)
	revision := frozenRevision(t, s.User.ID, p.ID, history, "additional-redaction")
	revision.RedactionPointers = []string{"/request/business"}
	freezeRevision(t, &revision)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/records/"+history.ID+"/revisions", revision, s, c, history.Etag), 200)
	if len(receipt.AffectedRecords) != 1 || receipt.AffectedRecords[0].ID != history.ID {
		t.Fatalf("archive identity leaked %+v", receipt)
	}
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/members/"+uid, wire.MemberRequest{Role: "developer"}, s, c, ""), 200)
	restored := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+saved.TargetID, nil, user, uc, ""), 200)
	if strings.Contains(restored.Snapshot.RequestJSON, "ARCHIVED_CONFIDENTIAL") || strings.Contains(restored.Snapshot.ResponseJSON, "ARCHIVED_CONFIDENTIAL") {
		t.Fatal("archive restored a deleted secret")
	}
}

func TestAdditionalRedactionPrivacyCleanupAllowedAboveReducedCapacity(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "OverCapacityCleanup")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	source := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	source.Snapshot.RequestJSON = `{"business":"OVER_CAPACITY_CONFIDENTIAL","n":0}`
	source.Snapshot.ResponseJSON = `{"echo":"OVER_CAPACITY_CONFIDENTIAL"}`
	freezeUpload(t, &source)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", source, s, c, ""), 200)
	history := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+source.TargetID, nil, s, c, ""), 200)
	copy := frozenUpload(t, s.User.ID, p.ID, conn, "saved", "private")
	copy.SourceRunID = history.Snapshot.RunID
	copy.Snapshot = history.Snapshot
	freezeUpload(t, &copy)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", copy, s, c, ""), 200)
	saved := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+copy.TargetID, nil, s, c, ""), 200)
	prior := frozenRevision(t, s.User.ID, p.ID, saved, "metadata")
	prior.Reason = "Remove later OVER_CAPACITY_CONFIDENTIAL"
	freezeRevision(t, &prior)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/records/"+saved.ID+"/revisions", prior, s, c, saved.Etag), 200)
	a.Config.RecordCapacityBytes = 1
	revision := frozenRevision(t, s.User.ID, p.ID, history, "additional-redaction")
	revision.RedactionPointers = []string{"/request/business"}
	revision.Reason = "Remove OVER_CAPACITY_CONFIDENTIAL"
	freezeRevision(t, &revision)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/records/"+history.ID+"/revisions", revision, s, c, history.Etag), 200)
	var leaked int
	if err := a.DB.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM records WHERE body::text LIKE '%OVER_CAPACITY_CONFIDENTIAL%')+(SELECT count(*) FROM record_revision_audits WHERE reason LIKE '%OVER_CAPACITY_CONFIDENTIAL%')`).Scan(&leaked); err != nil || leaked != 0 {
		t.Fatalf("over-capacity cleanup retained deleted secret %d %v", leaked, err)
	}
	cap := configurationData[capacityResult](t, configurationRequest(t, a, "GET", base+"/record-capacity", nil, s, c, ""), 200)
	if cap.UsedBytes <= cap.LimitBytes {
		t.Fatal("fixture did not remain over reduced capacity")
	}
	next := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", next, s, c, ""), 409)
}

func TestAcceptedOwnProjectSaveAndRevisionReplayAfterDeveloperDowngrade(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "ReceiptDowngrade")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	uid := addUser(t, a, "previous-maintainer@example.test", s.Teams[0].ID, "member")
	joinFixture(t, a, p.ID, uid, "maintainer")
	user, uc := login(t, a, "previous-maintainer@example.test")
	upload := frozenUpload(t, uid, p.ID, conn, "saved", "project")
	accepted := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", upload, user, uc, ""), 200)
	record := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+upload.TargetID, nil, user, uc, ""), 200)
	revision := frozenRevision(t, uid, p.ID, record, "metadata")
	revision.Metadata.Name = "Updated"
	freezeRevision(t, &revision)
	revised := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/records/"+record.ID+"/revisions", revision, user, uc, record.Etag), 200)
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/members/"+uid, wire.MemberRequest{Role: "developer"}, s, c, ""), 200)
	replay := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", upload, user, uc, ""), 200)
	again := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/records/"+record.ID+"/revisions", revision, user, uc, record.Etag), 200)
	if !reflect.DeepEqual(replay, accepted) || !reflect.DeepEqual(again, revised) {
		t.Fatal("accepted receipt changed during replay")
	}
	fresh := upload
	fresh.OperationID = id()
	fresh.TargetID = id()
	freezeUpload(t, &fresh)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", fresh, user, uc, ""), 403)
	freshRevision := revision
	freshRevision.OperationID = id()
	freezeRevision(t, &freshRevision)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/records/"+record.ID+"/revisions", freshRevision, user, uc, record.Etag), 403)
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/record-operations/"+upload.OperationID, nil, s, c, ""), 404)
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/members/"+uid, wire.MemberRequest{Role: "viewer"}, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", upload, user, uc, ""), 403)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/records/"+record.ID+"/revisions", revision, user, uc, record.Etag), 403)
	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/members/"+uid, nil, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/record-operations/"+upload.OperationID, nil, user, uc, ""), 403)
}
