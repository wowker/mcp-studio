//go:build !local

package platform

import (
	"context"
	"encoding/json"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/wire"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestSnapshotWholeContextOmissionClearsFreeLabels(t *testing.T) {
	snapshot := wire.ExecutionSnapshot{ToolName: "fixture-private-label", ToolDefinitionVersion: "fixture-private-label", EnvironmentVersion: "fixture-private-label", RequestJSON: `{"n":0}`, InputSchemaJSON: `{}`, ResponseJSON: `null`, ProtocolJSON: `null`, Redactions: []wire.RedactionMarker{}}
	safe, _, err := safeSnapshotMetadata(snapshot, wire.RecordMetadata{Name: "Fixture", Visibility: "private", ContentKind: "request-response", Completeness: "complete"}, nil, nil, []string{"request", "fixture-private-label"})
	if err != nil {
		t.Fatal(err)
	}
	if safe.ToolName == snapshot.ToolName || safe.ToolDefinitionVersion == snapshot.ToolDefinitionVersion || safe.EnvironmentVersion == snapshot.EnvironmentVersion {
		t.Fatal("whole-context omission retained source labels")
	}
}

func TestRecordHistoryFiltersStableCursorAndPrivateIsolation(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "History")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	for i := 0; i < 3; i++ {
		input := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
		configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 200)
	}
	first := configurationData[wire.RecordPage](t, configurationRequest(t, a, "GET", base+"/records?kind=history&limit=1", nil, s, c, ""), 200)
	if len(first.Items) != 1 || first.NextCursor == "" {
		t.Fatalf("first page %+v", first)
	}
	late := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", late, s, c, ""), 200)
	seen := map[string]bool{first.Items[0].ID: true}
	cursor := first.NextCursor
	for cursor != "" {
		page := configurationData[wire.RecordPage](t, configurationRequest(t, a, "GET", base+"/records?kind=history&limit=1&cursor="+url.QueryEscape(cursor), nil, s, c, ""), 200)
		for _, r := range page.Items {
			if seen[r.ID] || r.ID == late.TargetID {
				t.Fatal("cursor duplicated or admitted later insert")
			}
			seen[r.ID] = true
		}
		cursor = page.NextCursor
	}
	if len(seen) != 3 {
		t.Fatalf("cursor lost entries %v", seen)
	}
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records?kind=saved&limit=1&cursor="+url.QueryEscape(first.NextCursor), nil, s, c, ""), 400)
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records?kind=history&limit=1&cursor="+url.QueryEscape(first.NextCursor+"x"), nil, s, c, ""), 400)
	filtered := configurationData[wire.RecordPage](t, configurationRequest(t, a, "GET", base+"/records?kind=history&connectionId="+conn.ID+"&toolName=not-found", nil, s, c, ""), 200)
	if len(filtered.Items) != 0 {
		t.Fatal("tool filter ignored")
	}
	uid := addUser(t, a, "viewer@example.test", s.Teams[0].ID, "member")
	if _, err := a.DB.Exec(context.Background(), `INSERT INTO project_members VALUES($1,$2,'viewer')`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	viewer, vc := login(t, a, "viewer@example.test")
	private := frozenUpload(t, s.User.ID, p.ID, conn, "saved", "private")
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", private, s, c, ""), 200)
	list := configurationData[wire.RecordPage](t, configurationRequest(t, a, "GET", base+"/records?kind=saved", nil, viewer, vc, ""), 200)
	if len(list.Items) != 0 {
		t.Fatal("viewer saw another private record")
	}
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/record-operations/"+private.OperationID, nil, viewer, vc, ""), 404)
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records?kind=history&limit=1&cursor="+url.QueryEscape(first.NextCursor), nil, viewer, vc, ""), 400)
}
func TestRecordUploadAtomicReplayScopeAndRedaction(t *testing.T) {
	a, mail := testApp(t)
	s, cookie := owner(t, a, mail)
	p := createProject(t, a, s, cookie, "Records")
	connection := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+p.ID+"/connections", httpConfiguration("one"), s, cookie, ""), 200)
	base := "/api/v1/projects/" + p.ID
	input := frozenUpload(t, s.User.ID, p.ID, connection, "history", "project")
	input.Snapshot.RequestJSON = `{"token":"synthetic-raw-credential","n":0}`
	input.Snapshot.ResponseJSON = `{"echo":"synthetic-raw-credential","email":"synthetic@example.test"}`
	freezeUpload(t, &input)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, cookie, ""), 200)
	if receipt.OperationID != input.OperationID || receipt.RecordID != input.TargetID || receipt.FrozenDigest != input.FrozenDigest || receipt.Status != "recorded" {
		t.Fatalf("receipt %+v", receipt)
	}
	again := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, cookie, ""), 200)
	b1, _ := json.Marshal(receipt)
	b2, _ := json.Marshal(again)
	if string(b1) != string(b2) {
		t.Fatal("same immutable upload not replayed")
	}
	read := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, s, cookie, ""), 200)
	if read.Snapshot.RequestJSON == input.Snapshot.RequestJSON || read.Snapshot.ResponseJSON == input.Snapshot.ResponseJSON || len(read.Snapshot.Redactions) < 3 {
		t.Fatalf("raw body not redacted %+v", read)
	}
	var leaked int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM records WHERE body::text LIKE '%synthetic-raw-credential%' OR body::text LIKE '%synthetic@example.test%'`).Scan(&leaked); err != nil || leaked != 0 {
		t.Fatalf("persisted secret %d %v", leaked, err)
	}
	input.Metadata.Name = "Changed"
	freezeUpload(t, &input)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, cookie, ""), 409)
	input.OperationID = id()
	input.TargetID = id()
	freezeUpload(t, &input)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, cookie, ""), 409)
	lookup := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "GET", base+"/record-operations/"+receipt.OperationID, nil, s, cookie, ""), 200)
	if lookup.RecordID != receipt.RecordID {
		t.Fatal("receipt lookup lost")
	}
	var count int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM records WHERE project_id=$1`, p.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("duplicate upload records %d %v", count, err)
	}
}

func TestRecordUploadCurrentPermissionsIdentityAndBoundedJSON(t *testing.T) {
	a, mail := testApp(t)
	ownerSession, ownerCookie := owner(t, a, mail)
	p := createProject(t, a, ownerSession, ownerCookie, "Scope")
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", "/api/v1/projects/"+p.ID+"/connections", httpConfiguration("one"), ownerSession, ownerCookie, ""), 200)
	uid := addUser(t, a, "dev@example.test", ownerSession.Teams[0].ID, "member")
	if _, err := a.DB.Exec(context.Background(), `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	dev, devCookie := login(t, a, "dev@example.test")
	base := "/api/v1/projects/" + p.ID
	input := frozenUpload(t, uid, p.ID, conn, "saved", "private")
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, dev, devCookie, ""), 200)
	input = frozenUpload(t, uid, p.ID, conn, "saved", "project")
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, dev, devCookie, ""), 403)
	input = frozenUpload(t, ownerSession.User.ID, p.ID, conn, "history", "project")
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, dev, devCookie, ""), 400)
	input = frozenUpload(t, uid, p.ID, conn, "saved", "private")
	input.Snapshot.RequestJSON = `{"x":`
	freezeUpload(t, &input)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, dev, devCookie, ""), 400)
	input = frozenUpload(t, uid, p.ID, conn, "saved", "private")
	input.Snapshot.RunStatus = "idle"
	input.Snapshot.ResultKind = "none"
	input.Snapshot.RequestJSON = `{"n":"bad"}`
	freezeUpload(t, &input)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, dev, devCookie, ""), 200)
	read := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, dev, devCookie, ""), 200)
	if read.Metadata.Completeness != "incomplete" {
		t.Fatal("parseable invalid unexecuted draft not private incomplete")
	}
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, ownerSession, ownerCookie, ""), 404)
	if _, err := a.DB.Exec(context.Background(), `UPDATE project_members SET role='viewer' WHERE project_id=$1 AND user_id=$2`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, dev, devCookie, ""), 403)
	configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, dev, devCookie, ""), 200)
	if _, err := a.DB.Exec(context.Background(), `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/record-operations/"+receipt.OperationID, nil, dev, devCookie, ""), 403)
}

func frozenRevision(t *testing.T, uid, pid string, record wire.Record, kind string) wire.RecordRevisionInput {
	t.Helper()
	input := wire.RecordRevisionInput{ContractVersion: "1.2.0", UserID: uid, ProjectID: pid, ConnectionID: record.ConnectionID, OperationID: id(), RecordID: record.ID, BaseVersion: record.Version, RevisionKind: kind, Metadata: record.Metadata, RedactionPointers: []string{}}
	freezeRevision(t, &input)
	return input
}
func freezeRevision(t *testing.T, input *wire.RecordRevisionInput) {
	t.Helper()
	b, _ := json.Marshal(input)
	sum, err := recording.Digest(string(b))
	if err != nil {
		t.Fatal(err)
	}
	input.FrozenDigest = sum
}

func TestRecordSavedMetadataConditionalPinDeletionAndIndependence(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Saved")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	historyInput := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	historyReceipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", historyInput, s, c, ""), 200)
	history := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+historyReceipt.RecordID, nil, s, c, ""), 200)
	savedInput := frozenUpload(t, s.User.ID, p.ID, conn, "saved", "private")
	savedInput.SourceRunID = history.Snapshot.RunID
	savedInput.Snapshot = history.Snapshot
	freezeUpload(t, &savedInput)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", savedInput, s, c, ""), 200)
	saved := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, s, c, ""), 200)
	revision := frozenRevision(t, s.User.ID, p.ID, saved, "metadata")
	revision.Metadata.Name = "Renamed"
	revision.Metadata.Note = "member@example.test"
	freezeRevision(t, &revision)
	path := base + "/records/" + saved.ID + "/revisions"
	configurationData[any](t, configurationRequest(t, a, "POST", path, revision, s, c, ""), 428)
	revised := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", path, revision, s, c, saved.Etag), 200)
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", path, revision, s, c, saved.Etag), 200)
	current := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+saved.ID, nil, s, c, ""), 200)
	if revised.Version != 2 || current.Version != 2 || current.Metadata.Name != "Renamed" || current.Metadata.Note != "[REDACTED]" || current.Snapshot.RequestJSON != saved.Snapshot.RequestJSON || current.Snapshot.ResponseJSON != saved.Snapshot.ResponseJSON {
		t.Fatalf("metadata changedfrozenbody %+v", current)
	}
	stale := revision
	stale.OperationID = id()
	freezeRevision(t, &stale)
	configurationData[any](t, configurationRequest(t, a, "POST", path, stale, s, c, saved.Etag), 409)
	pinned := configurationData[wire.Record](t, configurationRequest(t, a, "PATCH", base+"/records/"+history.ID+"/pin", wire.RecordPinInput{Pinned: true}, s, c, history.Etag), 200)
	configurationData[any](t, configurationRequest(t, a, "DELETE", base+"/records/"+history.ID, nil, s, c, pinned.Etag), 409)
	unpinned := configurationData[wire.Record](t, configurationRequest(t, a, "PATCH", base+"/records/"+history.ID+"/pin", wire.RecordPinInput{}, s, c, pinned.Etag), 200)
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", base+"/records/"+history.ID, nil, s, c, unpinned.Etag), 200)
	configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+saved.ID, nil, s, c, ""), 200)
	configurationData[wire.Accepted](t, configurationRequest(t, a, "DELETE", base+"/connections/"+conn.ID, nil, s, c, conn.Etag), 200)
	configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+saved.ID, nil, s, c, ""), 200)
}

func TestRecordAdditionalRedactionPolicyAndLinkedPrivateCopies(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Redaction")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	historyInput := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	historyInput.Snapshot.RequestJSON = `{"business":"CONFIDENTIAL_BUSINESS","n":0}`
	historyInput.Snapshot.ResponseJSON = `{"echo":"returned CONFIDENTIAL_BUSINESS"}`
	freezeUpload(t, &historyInput)
	h := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", historyInput, s, c, ""), 200)
	history := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+h.RecordID, nil, s, c, ""), 200)
	uid := addUser(t, a, "dev@example.test", s.Teams[0].ID, "member")
	if _, err := a.DB.Exec(context.Background(), `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	dev, dc := login(t, a, "dev@example.test")
	savedInput := frozenUpload(t, uid, p.ID, conn, "saved", "private")
	savedInput.SourceRunID = history.Snapshot.RunID
	savedInput.Snapshot = history.Snapshot
	freezeUpload(t, &savedInput)
	copied := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", savedInput, dev, dc, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "GET", base+"/records/"+copied.RecordID, nil, s, c, ""), 404)
	revision := frozenRevision(t, s.User.ID, p.ID, history, "additional-redaction")
	revision.RedactionPointers = []string{"/request/business"}
	revision.Reason = "Remove CONFIDENTIAL_BUSINESS"
	freezeRevision(t, &revision)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/records/"+history.ID+"/revisions", revision, dev, dc, history.Etag), 403)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/records/"+history.ID+"/revisions", revision, s, c, history.Etag), 200)
	if len(receipt.AffectedRecords) != 1 || receipt.AffectedRecords[0].ID != history.ID {
		t.Fatal("private copy identity leaked to maintainer receipt")
	}
	read := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+copied.RecordID, nil, dev, dc, ""), 200)
	if read.Version != 2 || strings.Contains(read.Snapshot.RequestJSON, "CONFIDENTIAL_BUSINESS") || strings.Contains(read.Snapshot.ResponseJSON, "CONFIDENTIAL_BUSINESS") {
		t.Fatal("linked private copy did not redact atomically")
	}
	audits := configurationData[[]wire.RecordRevisionAudit](t, configurationRequest(t, a, "GET", base+"/records/"+history.ID+"/audits", nil, s, c, ""), 200)
	if len(audits) != 1 || strings.Contains(audits[0].Reason, "CONFIDENTIAL_BUSINESS") {
		t.Fatalf("audit stored deleted secret %+v", audits)
	}
	var leaked int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM records WHERE project_id=$1 AND body::text LIKE '%CONFIDENTIAL_BUSINESS%'`, p.ID).Scan(&leaked); err != nil || leaked != 0 {
		t.Fatalf("deletedsecret persisted %d %v", leaked, err)
	}
	policy := configurationData[wire.RecordRedactionPolicy](t, configurationRequest(t, a, "GET", base+"/record-redaction-policy", nil, s, c, ""), 200)
	configurationData[any](t, configurationRequest(t, a, "PATCH", base+"/record-redaction-policy", wire.RecordRedactionPolicyInput{Pointers: []string{"/request/n"}}, dev, dc, policy.Etag), 403)
	updated := configurationData[wire.RecordRedactionPolicy](t, configurationRequest(t, a, "PATCH", base+"/record-redaction-policy", wire.RecordRedactionPolicyInput{Pointers: []string{"/request/n"}}, s, c, policy.Etag), 200)
	if updated.Version != 2 {
		t.Fatal("policy version not updated")
	}
	next := frozenUpload(t, uid, p.ID, conn, "history", "project")
	n := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", next, dev, dc, ""), 200)
	safe := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+n.RecordID, nil, dev, dc, ""), 200)
	if safe.Snapshot.RequestJSON == next.Snapshot.RequestJSON {
		t.Fatal("projectpolicy ignored at reception")
	}
}

func TestRecordSourceProofOwnUnuploadedRunAndRedactedAuditHistory(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Proof")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	uid := addUser(t, a, "dev@example.test", s.Teams[0].ID, "member")
	if _, err := a.DB.Exec(context.Background(), `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	dev, dc := login(t, a, "dev@example.test")
	own := frozenUpload(t, uid, p.ID, conn, "saved", "private")
	own.SourceRunID = own.Snapshot.RunID
	freezeUpload(t, &own)
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", own, dev, dc, ""), 200)
	hi := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	hi.Snapshot.RequestJSON = `{"business":"BUSINESS_PRIVATE_SENTINEL"}`
	hi.Snapshot.ResponseJSON = `null`
	freezeUpload(t, &hi)
	hr := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", hi, s, c, ""), 200)
	history := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+hr.RecordID, nil, s, c, ""), 200)
	tampered := frozenUpload(t, uid, p.ID, conn, "saved", "private")
	tampered.SourceRunID = history.Snapshot.RunID
	tampered.Snapshot = history.Snapshot
	tampered.Snapshot.RequestJSON = `{"business":"FORGED_ATTRIBUTION"}`
	freezeUpload(t, &tampered)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", tampered, dev, dc, ""), 400)
	original := tampered
	original.OperationID = id()
	original.TargetID = id()
	original.Snapshot = history.Snapshot
	original.Metadata.Note = "contains BUSINESS_PRIVATE_SENTINEL"
	freezeUpload(t, &original)
	sr := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", original, dev, dc, ""), 200)
	saved := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+sr.RecordID, nil, dev, dc, ""), 200)
	meta := frozenRevision(t, uid, p.ID, saved, "metadata")
	meta.Metadata.Name = "contains BUSINESS_PRIVATE_SENTINEL"
	meta.Reason = "historical BUSINESS_PRIVATE_SENTINEL"
	freezeRevision(t, &meta)
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/records/"+saved.ID+"/revisions", meta, dev, dc, saved.Etag), 200)
	red := frozenRevision(t, s.User.ID, p.ID, history, "additional-redaction")
	red.RedactionPointers = []string{"/request/business"}
	red.Reason = "remove business"
	freezeRevision(t, &red)
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/records/"+history.ID+"/revisions", red, s, c, history.Etag), 200)
	var leaks int
	err := a.DB.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM records WHERE project_id=$1 AND body::text LIKE '%BUSINESS_PRIVATE_SENTINEL%')+(SELECT count(*) FROM record_revision_audits WHERE project_id=$1 AND reason LIKE '%BUSINESS_PRIVATE_SENTINEL%')`, p.ID).Scan(&leaks)
	if err != nil || leaks != 0 {
		t.Fatalf("deleted businesssecret remains in metadata/audit %d %v", leaks, err)
	}
}

func TestRecordAtomicFailureRetryAndConcurrentReplay(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Atomic")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	input := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	ctx := context.Background()
	if _, err := a.DB.Exec(ctx, `CREATE FUNCTION fail_record_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic receipt failure'; END $$; CREATE TRIGGER record_receipt_failure BEFORE INSERT ON record_operations FOR EACH ROW EXECUTE FUNCTION fail_record_receipt()`); err != nil {
		t.Fatal(err)
	}
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 503)
	var count int
	if err := a.DB.QueryRow(ctx, `SELECT (SELECT count(*) FROM records)+(SELECT count(*) FROM record_operations)`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("partial commit %d %v", count, err)
	}
	if _, err := a.DB.Exec(ctx, `DROP TRIGGER record_receipt_failure ON record_operations`); err != nil {
		t.Fatal(err)
	}
	outputs := make(chan *httptest.ResponseRecorder, 2)
	for i := 0; i < 2; i++ {
		go func() { outputs <- configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, "") }()
	}
	first := configurationData[wire.RecordOperationReceipt](t, <-outputs, 200)
	second := configurationData[wire.RecordOperationReceipt](t, <-outputs, 200)
	b1, _ := json.Marshal(first)
	b2, _ := json.Marshal(second)
	if string(b1) != string(b2) {
		t.Fatal("concurrent immutable retry did not return one receipt")
	}
	if err := a.DB.QueryRow(ctx, `SELECT (SELECT count(*) FROM records)+(SELECT count(*) FROM record_operations)`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("notexactlyone record/receipt %d %v", count, err)
	}
}

func TestRecordUploadWaitingOnMembershipRevocation(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Revocation")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	uid := addUser(t, a, "dev@example.test", s.Teams[0].ID, "member")
	ctx := context.Background()
	if _, err := a.DB.Exec(ctx, `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	dev, dc := login(t, a, "dev@example.test")
	input := frozenUpload(t, uid, p.ID, conn, "history", "project")
	tx, err := a.DB.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err = lockTeamTx(ctx, tx, s.Teams[0].ID); err != nil {
		t.Fatal(err)
	}
	completed := make(chan *httptest.ResponseRecorder, 1)
	go func() { completed <- configurationRequest(t, a, "POST", base+"/record-uploads", input, dev, dc, "") }()
	deadline := time.After(3 * time.Second)
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	waiting := false
	for !waiting {
		select {
		case <-deadline:
			tx.Rollback(ctx)
			<-completed
			t.Fatal("upload did not wait on membership serialization lock")
		case w := <-completed:
			t.Fatalf("upload bypassed team lock %d", w.Code)
		case <-ticker.C:
			if err = a.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.wait_event_type='Lock' AND a.query='SELECT id FROM teams WHERE id=$1 FOR UPDATE' AND a.pid IN (SELECT pid FROM pg_locks WHERE relation='teams'::regclass))`).Scan(&waiting); err != nil {
				tx.Rollback(ctx)
				<-completed
				t.Fatal(err)
			}
		}
	}
	if _, err = tx.Exec(ctx, `DELETE FROM project_members WHERE project_id=$1 AND user_id=$2`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	configurationData[any](t, <-completed, 403)
	var count int
	if err = a.DB.QueryRow(ctx, `SELECT count(*) FROM record_operations WHERE operation_id=$1`, input.OperationID).Scan(&count); err != nil || count != 0 {
		t.Fatalf("revokedupload persisted %d %v", count, err)
	}
}

func TestRecordDecoderEscapedWireBudgetAndAmbiguousJSON(t *testing.T) {
	input := frozenUpload(t, "u", "p", wire.Connection{ID: "c", Version: 1}, "history", "project")
	input.Snapshot.ResponseJSON = `"` + strings.Repeat(`\\`, (9<<20)/2) + `"`
	freezeUpload(t, &input)
	raw, _ := json.Marshal(input)
	if len(raw) < 16<<20 {
		t.Fatal("testdidnotexceedoldwirebudget")
	}
	r := httptest.NewRequest("POST", "/", strings.NewReader(string(raw)))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	var decoded wire.RecordUploadInput
	if _, ok := decodeRecord(w, r, &decoded); !ok {
		t.Fatalf("valid escaped9MiBresponse rejected %d %s", w.Code, w.Body.String())
	}
	for _, text := range []string{`{"x":1,"x":2}`, `{"x":"\ud800"}`, `{"x":9007199254740992}`} {
		r := httptest.NewRequest("POST", "/", strings.NewReader(text))
		r.Header.Set("Content-Type", "application/json")
		if _, ok := decodeRecord(httptest.NewRecorder(), r, &decoded); ok {
			t.Fatal("ambiguousrawinput accepted")
		}
	}
}

func TestRecordSchemaShapeAndJointMetadataSecretPropagation(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Schema")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	input := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	input.Snapshot.RequestJSON = `{"token":"SYNTHETIC_CONNECTED_CREDENTIAL"}`
	input.Snapshot.InputSchemaJSON = `{"type":"object","properties":{"token":{"type":"string","default":"SYNTHETIC_CONNECTED_CREDENTIAL"}},"required":["token"]}`
	input.Metadata.Note = "echo SYNTHETIC_CONNECTED_CREDENTIAL"
	freezeUpload(t, &input)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 200)
	stored := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, s, c, ""), 200)
	if strings.Contains(stored.Snapshot.InputSchemaJSON, "SYNTHETIC_CONNECTED_CREDENTIAL") || strings.Contains(stored.Metadata.Note, "SYNTHETIC_CONNECTED_CREDENTIAL") {
		t.Fatal("schemaannotation/metadata credential leaked")
	}
	var schemaBody map[string]any
	if err := json.Unmarshal([]byte(stored.Snapshot.InputSchemaJSON), &schemaBody); err != nil {
		t.Fatal(err)
	}
	properties, ok := schemaBody["properties"].(map[string]any)
	if !ok {
		t.Fatal("formalproperties removed")
	}
	token, ok := properties["token"].(map[string]any)
	if !ok || token["type"] != "string" {
		t.Fatal("legitimate credential schema property altered")
	}
	if stored.Metadata.Completeness != "complete" || !stored.Snapshot.SchemaValid {
		t.Fatal("executed validation fact changed afterredaction")
	}
}

func TestRecordSchemaAnnotationTraversalKeepsNamedValidationNodes(t *testing.T) {
	raw := `{"properties":{"description":{"type":"string","minLength":2},"default":{"type":"number"},"token":{"type":"string","default":"SYNTHETIC_SOURCE"}},"patternProperties":{"description":{"type":"string","minLength":3}},"$defs":{"title":{"type":"number"}},"dependentSchemas":{"examples":{"required":["description"]}}}`
	safe, changed, err := sanitizeRecordSchema(raw, []string{"SYNTHETIC_SOURCE"})
	if err != nil || !changed {
		t.Fatalf("sanitation %s %v %v", safe, changed, err)
	}
	var value map[string]any
	if err = json.Unmarshal([]byte(safe), &value); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"properties", "patternProperties", "$defs", "dependentSchemas"} {
		if _, ok := value[key].(map[string]any); !ok {
			t.Fatalf("formalnode map removed %s", key)
		}
	}
	props := value["properties"].(map[string]any)
	if props["description"].(map[string]any)["minLength"] != float64(2) || props["default"].(map[string]any)["type"] != "number" || props["token"].(map[string]any)["type"] != "string" {
		t.Fatal("annotation-namedproperty constraints altered")
	}
	if _, exists := props["token"].(map[string]any)["default"]; exists {
		t.Fatal("credentialannotation retained")
	}
	if value["patternProperties"].(map[string]any)["description"].(map[string]any)["minLength"] != float64(3) {
		t.Fatal("patternnameddescription constraint altered")
	}
}

func TestRecordBrowserSavedCopyPreservesAgentAttributionAndRequestOnlySchema(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Attribution")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	historyInput := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	historyInput.ResponsibleEndpoint = "agent"
	historyInput.Snapshot.Executor = "agent"
	historyInput.Snapshot.ResponseJSON = `{"email":{"$redacted":true}}`
	historyInput.Snapshot.Redactions = []wire.RedactionMarker{{Path: "/response/email", Reason: "default"}}
	freezeUpload(t, &historyInput)
	// This pre-existing archive fixture does not implement Agent auth or execution.
	now := a.Now()
	_, err := a.DB.Exec(context.Background(), `INSERT INTO records(id,project_id,connection_id,owner_id,kind,run_id,source_run_id,visibility,version,created_at,updated_at,pinned,body) VALUES($1,$2,$3,$4,'history',$5,'','project',1,$6,$6,false,$7)`, historyInput.TargetID, p.ID, conn.ID, s.User.ID, historyInput.Snapshot.RunID, now, recordBody(historyInput.Snapshot, historyInput.Metadata))
	if err != nil {
		t.Fatal(err)
	}
	source := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+historyInput.TargetID, nil, s, c, ""), 200)
	savedInput := frozenUpload(t, s.User.ID, p.ID, conn, "saved", "private")
	savedInput.ResponsibleEndpoint = "browser"
	savedInput.SourceRunID = source.Snapshot.RunID
	savedInput.Snapshot = source.Snapshot
	savedInput.Metadata.ContentKind = "request"
	savedInput.Snapshot.ResponseJSON = "null"
	savedInput.Snapshot.ProtocolJSON = "null"
	savedInput.Snapshot.ResponseRetention = "omitted"
	savedInput.Snapshot.OmissionReason = "request_only"
	savedInput.Snapshot.Redactions = []wire.RedactionMarker{}
	freezeUpload(t, &savedInput)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", savedInput, s, c, ""), 200)
	saved := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, s, c, ""), 200)
	if receipt.ResponsibleEndpoint != "browser" || saved.Snapshot.Executor != "agent" || saved.Snapshot.InputSchemaJSON != source.Snapshot.InputSchemaJSON || saved.Snapshot.ResponseJSON != "null" {
		t.Fatalf("savedcopy alteredattribution/schema %+v %+v", receipt, saved)
	}
}

func TestRecordIncompleteSavedCannotPublishByMetadataRevision(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Incomplete")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	input := frozenUpload(t, s.User.ID, p.ID, conn, "saved", "private")
	input.Snapshot.RunStatus = "idle"
	input.Snapshot.ResultKind = "none"
	input.Snapshot.RequestJSON = `{"n":"bad"}`
	freezeUpload(t, &input)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 200)
	saved := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, s, c, ""), 200)
	revision := frozenRevision(t, s.User.ID, p.ID, saved, "metadata")
	revision.Metadata.Visibility = "project"
	freezeRevision(t, &revision)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/records/"+saved.ID+"/revisions", revision, s, c, saved.Etag), 400)
	stillPrivate := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+saved.ID, nil, s, c, ""), 200)
	if stillPrivate.Version != 1 || stillPrivate.Metadata.Visibility != "private" {
		t.Fatal("incomplete publication persisted")
	}
}

func TestSnapshotFreeContextIsRedactedWithoutChangingActualIdentities(t *testing.T) {
	snapshot := wire.ExecutionSnapshot{UserID: "u", ProjectID: "p", ConnectionID: "c", TabID: "t", RunID: "REAL_RUN_ID", ToolName: "tool REAL_RUN_ID", ToolDefinitionVersion: "schema REAL_RUN_ID", EnvironmentVersion: "environment REAL_RUN_ID", OmissionReason: "failure REAL_RUN_ID", RequestJSON: `{"token":"REAL_RUN_ID"}`, InputSchemaJSON: `{"type":"object"}`, ResponseJSON: `null`, ProtocolJSON: `null`, StartedAt: "2026-10-13T00:00:00Z", FinishedAt: "2026-10-13T00:00:01Z", SchemaValid: true}
	metadata := wire.RecordMetadata{Name: "Public", Visibility: "project", ContentKind: "request-response", Completeness: "complete"}
	safe, _, err := safeSnapshotMetadata(snapshot, metadata, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{safe.ToolName, safe.ToolDefinitionVersion, safe.EnvironmentVersion, safe.OmissionReason} {
		if strings.Contains(value, "REAL_RUN_ID") {
			t.Fatal("freecontext sourceecho leaked")
		}
	}
	if safe.RunID != snapshot.RunID || safe.UserID != snapshot.UserID || safe.ProjectID != snapshot.ProjectID || safe.ConnectionID != snapshot.ConnectionID || safe.TabID != snapshot.TabID || safe.StartedAt != snapshot.StartedAt || safe.FinishedAt != snapshot.FinishedAt {
		t.Fatal("independentrealidentities/timestamps altered")
	}
	contexts := map[string]bool{}
	for _, marker := range safe.Redactions {
		contexts[marker.Path] = true
	}
	for _, path := range []string{"/context/toolName", "/context/toolDefinitionVersion", "/context/environmentVersion", "/context/omissionReason"} {
		if !contexts[path] {
			t.Fatalf("missingstructuralcontextmarker %s", path)
		}
	}
}

func TestAdditionalRedactionAcceptsClientSafeMetadataProjectionOnly(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "Projection")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	input := frozenUpload(t, s.User.ID, p.ID, conn, "saved", "private")
	input.Snapshot.RequestJSON = `{"business":"BUSINESS_SECRET_FOR_REVISION"}`
	input.Metadata.Note = "echo BUSINESS_SECRET_FOR_REVISION"
	freezeUpload(t, &input)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 200)
	saved := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, s, c, ""), 200)
	revision := frozenRevision(t, s.User.ID, p.ID, saved, "additional-redaction")
	revision.RedactionPointers = []string{"/request/business"}
	revision.Metadata.Note = "[REDACTED]"
	revision.Reason = "[REDACTED]"
	freezeRevision(t, &revision)
	forged := revision
	forged.OperationID = id()
	forged.Metadata.Name = "Unrelated edit"
	freezeRevision(t, &forged)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/records/"+saved.ID+"/revisions", forged, s, c, saved.Etag), 400)
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/records/"+saved.ID+"/revisions", revision, s, c, saved.Etag), 200)
	current := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+saved.ID, nil, s, c, ""), 200)
	if current.Metadata.Name != saved.Metadata.Name || current.Metadata.Note != "[REDACTED]" || strings.Contains(current.Snapshot.RequestJSON, "BUSINESS_SECRET_FOR_REVISION") {
		t.Fatal("safeprojection didnotapplyatomicredaction")
	}
}

func TestCookieRecordUploadsCannotClaimAgentResponsibility(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "BrowserOnly")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	for _, kind := range []string{"history", "saved"} {
		input := frozenUpload(t, s.User.ID, p.ID, conn, kind, "private")
		input.ResponsibleEndpoint = "agent"
		input.Snapshot.Executor = "agent"
		freezeUpload(t, &input)
		configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, s, c, ""), 403)
	}
	var count int
	if err := a.DB.QueryRow(context.Background(), `SELECT count(*) FROM records`).Scan(&count); err != nil || count != 0 {
		t.Fatalf("untrustedAgentclaim persisted %d %v", count, err)
	}
}

func TestSavedSourceProofUsesCurrentPolicyAndSemanticJSON(t *testing.T) {
	a, mail := testApp(t)
	s, c := owner(t, a, mail)
	p := createProject(t, a, s, c, "CurrentPolicy")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, c, ""), 200)
	original := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	original.Snapshot.RequestJSON = `{"n":0.0,"business":"NEW_POLICY_BUSINESS_SECRET"}`
	original.Snapshot.ResponseJSON = `{"echo":"returned NEW_POLICY_BUSINESS_SECRET"}`
	freezeUpload(t, &original)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", original, s, c, ""), 200)
	source := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, s, c, ""), 200)
	policy := configurationData[wire.RecordRedactionPolicy](t, configurationRequest(t, a, "GET", base+"/record-redaction-policy", nil, s, c, ""), 200)
	configurationData[wire.RecordRedactionPolicy](t, configurationRequest(t, a, "PATCH", base+"/record-redaction-policy", wire.RecordRedactionPolicyInput{Pointers: []string{"/request/business"}}, s, c, policy.Etag), 200)
	uid := addUser(t, a, "dev@example.test", s.Teams[0].ID, "member")
	if _, err := a.DB.Exec(context.Background(), `INSERT INTO project_members VALUES($1,$2,'developer')`, p.ID, uid); err != nil {
		t.Fatal(err)
	}
	dev, dc := login(t, a, "dev@example.test")
	input := frozenUpload(t, uid, p.ID, conn, "saved", "private")
	input.SourceRunID = source.Snapshot.RunID
	input.Snapshot = source.Snapshot
	input.Snapshot.RequestJSON = `{"n":0,"business":{"$redacted":true}}`
	input.Snapshot.ResponseJSON = `{"echo":{"$redacted":true}}`
	input.Snapshot.Redactions = []wire.RedactionMarker{{Path: "/request/business", Reason: "project"}, {Path: "/response/echo", Reason: "source"}}
	input.Metadata.Name = "Fresh private copy"
	freezeUpload(t, &input)
	copied := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", input, dev, dc, ""), 200)
	saved := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+copied.RecordID, nil, dev, dc, ""), 200)
	if !saved.Snapshot.SchemaValid || saved.Metadata.Completeness != "complete" || saved.Snapshot.UserID != s.User.ID || saved.Snapshot.RequestJSON != input.Snapshot.RequestJSON {
		t.Fatal("policyprojection lostoriginalexecutionfact/rawfreezedsnapshot")
	}
	tampered := input
	tampered.TargetID = id()
	tampered.OperationID = id()
	tampered.Snapshot.RequestJSON = `{"n":99,"business":{"$redacted":true}}`
	freezeUpload(t, &tampered)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", tampered, dev, dc, ""), 400)
	unsafeCopy := input
	unsafeCopy.TargetID = id()
	unsafeCopy.OperationID = id()
	unsafeCopy.Snapshot = source.Snapshot
	freezeUpload(t, &unsafeCopy)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", unsafeCopy, dev, dc, ""), 400)
	echoedMetadata := input
	echoedMetadata.TargetID = id()
	echoedMetadata.OperationID = id()
	echoedMetadata.Metadata.Note = "malicious NEW_POLICY_BUSINESS_SECRET echo"
	freezeUpload(t, &echoedMetadata)
	safeReceipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", echoedMetadata, dev, dc, ""), 200)
	safe := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+safeReceipt.RecordID, nil, dev, dc, ""), 200)
	if strings.Contains(safe.Metadata.Note, "NEW_POLICY_BUSINESS_SECRET") {
		t.Fatal("originalpolicysource lostbefore receiver metadataredaction")
	}
}

func TestSavedVersionHashSourceProofRequiresTheRecordedRedaction(t *testing.T) {
	a, mail := testApp(t)
	s, cookie := owner(t, a, mail)
	p := createProject(t, a, s, cookie, "Source redaction parity")
	base := "/api/v1/projects/" + p.ID
	conn := configurationData[wire.Connection](t, configurationRequest(t, a, "POST", base+"/connections", httpConfiguration("one"), s, cookie, ""), 200)
	history := frozenUpload(t, s.User.ID, p.ID, conn, "history", "project")
	// A synthetic SHA256-shaped version contains a sequence covered by the existing default phone rule.
	history.Snapshot.EnvironmentVersion = strings.Repeat("a", 22) + "0123456789" + strings.Repeat("b", 32)
	freezeUpload(t, &history)
	configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", history, s, cookie, ""), 200)
	source := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+history.TargetID, nil, s, cookie, ""), 200)
	if source.Snapshot.EnvironmentVersion != "[REDACTED]" {
		t.Fatal("recorded source did not apply its default redaction")
	}
	found := false
	for _, marker := range source.Snapshot.Redactions {
		if marker.Path == "/context/environmentVersion" && marker.Reason == "default" {
			found = true
		}
	}
	if !found {
		t.Fatal("recorded source omitted its context redaction marker")
	}
	copy := history
	copy.TargetKind, copy.TargetID, copy.OperationID, copy.SourceRunID = "saved", id(), id(), history.Snapshot.RunID
	copy.Metadata.Name, copy.Metadata.Visibility = "Independent copy", "private"
	freezeUpload(t, &copy)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", copy, s, cookie, ""), 400)
	copy.Snapshot = source.Snapshot
	freezeUpload(t, &copy)
	receipt := configurationData[wire.RecordOperationReceipt](t, configurationRequest(t, a, "POST", base+"/record-uploads", copy, s, cookie, ""), 200)
	saved := configurationData[wire.Record](t, configurationRequest(t, a, "GET", base+"/records/"+receipt.RecordID, nil, s, cookie, ""), 200)
	if saved.SourceRunID != source.Snapshot.RunID || saved.ID == source.ID || saved.Snapshot.EnvironmentVersion != "[REDACTED]" {
		t.Fatal("saved copy did not preserve the recorded source identity and safe version")
	}
	copy.TargetID, copy.OperationID = id(), id()
	copy.Snapshot.RunStatus = "failed"
	freezeUpload(t, &copy)
	configurationData[any](t, configurationRequest(t, a, "POST", base+"/record-uploads", copy, s, cookie, ""), 400)
}
