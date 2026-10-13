package platform

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/wire"
	"net/http"
	"sort"
	"strings"
	"time"
)

func recordWritable(record wire.Record, uid, role string) bool {
	if role != "maintainer" && role != "developer" {
		return false
	}
	if record.Metadata.Visibility == "private" {
		return record.OwnerID == uid
	}
	return role == "maintainer"
}
func (a *App) reviseRecord(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, false, true)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	rid := r.PathValue("recordId")
	old, err := recordValue(ctx, tx, pid, rid, u.ID)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	var input wire.RecordRevisionInput
	sum, ok := decodeRecord(w, r, &input)
	if !ok {
		return
	}
	// A caller without edit authority cannot present another actor's
	// revision as a receipt retry. Preserve the existing authorization denial.
	if input.UserID != u.ID && !recordWritable(old, u.ID, scope.projectRole) {
		fail(w, 403, "forbidden")
		return
	}
	if input.ContractVersion != "1.2.0" || input.UserID != u.ID || input.ProjectID != pid || input.ConnectionID != old.ConnectionID || input.RecordID != rid || !validRecordID(input.OperationID) || input.OperationID == rid || input.BaseVersion < 1 || !oneOf(input.RevisionKind, "metadata", "additional-redaction") || len(input.Reason) > 4096 || len(input.RedactionPointers) > 128 {
		fail(w, 400, "invalid_revision")
		return
	}
	if input.FrozenDigest != sum {
		fail(w, 409, "digest_conflict")
		return
	}
	if replayOperation(w, r, tx, input.OperationID, pid, u.ID, old.ConnectionID, rid, sum, "browser") {
		return
	}
	if !recordWritable(old, u.ID, scope.projectRole) {
		fail(w, 403, "forbidden")
		return
	}
	if input.BaseVersion != old.Version {
		fail(w, 409, "version_conflict")
		return
	}
	if !configurationMatch(w, r, rid, old.Version) {
		return
	}
	affected := []wire.AffectedRecord{}
	reason := safeRecordText(input.Reason)
	if input.RevisionKind == "metadata" {
		m := input.Metadata
		if old.Kind != "saved" || len(input.RedactionPointers) > 0 || strings.TrimSpace(m.Name) == "" || len(m.Name) > 200 || len(m.Note) > 4096 || !oneOf(m.Visibility, "private", "project") || m.ContentKind != old.Metadata.ContentKind || m.Completeness != old.Metadata.Completeness || m.Visibility == "project" && m.Completeness == "incomplete" {
			fail(w, 400, "invalid_metadata_revision")
			return
		}
		if m.Visibility == "project" && scope.projectRole != "maintainer" {
			fail(w, 403, "forbidden")
			return
		}
		m.Name = safeRecordText(strings.TrimSpace(m.Name))
		m.Note = safeRecordText(m.Note)
		if _, err = tx.Exec(ctx, `UPDATE records SET visibility=$3,version=version+1,updated_at=$4,body=$5 WHERE project_id=$1 AND id=$2`, pid, rid, m.Visibility, a.Now(), recordBody(old.Snapshot, m)); err != nil {
			configurationFailure(w, err)
			return
		}
		affected = append(affected, wire.AffectedRecord{ID: rid, Version: old.Version + 1})
	} else {
		if len(input.RedactionPointers) == 0 {
			fail(w, 400, "invalid_redaction_revision")
			return
		}
		source, err := snapshotObject(old.Snapshot)
		if err == nil {
			source["metadata"] = metadataObject(old.Metadata)
		}
		if err != nil {
			configurationFailure(w, err)
			return
		}
		secrets := []string{}
		for _, path := range input.RedactionPointers {
			parts, e := recording.Pointer(path)
			if e != nil || len(parts) == 0 || !oneOf(parts[0], "request", "response", "protocol", "metadata", "context") {
				fail(w, 400, "invalid_pointer")
				return
			}
			value, exists := recording.ValueAt(source, parts)
			if !exists {
				fail(w, 400, "invalid_pointer")
				return
			}
			secrets = append(secrets, recording.StringLeaves(value)...)
		}
		if input.Metadata != safeRecordMetadataSources(old.Metadata, secrets) {
			fail(w, 400, "invalid_redaction_revision")
			return
		}
		maskedReason, _ := recording.Redact(input.Reason, recording.Options{SecretValues: secrets})
		if text, ok := maskedReason.Value.(string); ok {
			reason = text
		} else {
			reason = "[REDACTED]"
		}
		records := []wire.Record{old}
		rows, err := tx.Query(ctx, `SELECT `+recordColumns+` FROM records r JOIN users u ON u.id=r.owner_id WHERE r.project_id=$1 AND r.connection_id=$2 AND r.kind='saved' AND r.source_run_id=$3 AND r.id<>$4 AND ($5 OR (r.owner_id=$6 AND r.visibility='private')) ORDER BY r.id`, pid, old.ConnectionID, old.Snapshot.RunID, rid, old.Metadata.Visibility == "project" && scope.projectRole == "maintainer", u.ID)
		if err != nil {
			configurationFailure(w, err)
			return
		}
		for rows.Next() {
			record, err := scanRecord(rows)
			if err != nil {
				rows.Close()
				configurationFailure(w, err)
				return
			}
			records = append(records, record)
		}
		rows.Close()
		if err = rows.Err(); err != nil {
			configurationFailure(w, err)
			return
		}
		for _, record := range records {
			var snapshot wire.ExecutionSnapshot
			var metadata wire.RecordMetadata
			if record.ID == rid {
				snapshot, metadata, err = safeSnapshotMetadata(record.Snapshot, record.Metadata, nil, input.RedactionPointers, secrets)
			} else {
				snapshot, metadata, err = safeSnapshotMetadata(record.Snapshot, record.Metadata, input.RedactionPointers, nil, secrets)
			}
			if err != nil {
				fail(w, 400, "invalid_pointer")
				return
			}
			if _, err = tx.Exec(ctx, `UPDATE records SET version=version+1,updated_at=$3,body=$4 WHERE project_id=$1 AND id=$2`, pid, record.ID, a.Now(), recordBody(snapshot, metadata)); err != nil {
				configurationFailure(w, err)
				return
			}
			if err = redactPriorAuditReasons(ctx, tx, pid, record.ID, secrets); err != nil {
				configurationFailure(w, err)
				return
			}
			pointers, _ := json.Marshal(input.RedactionPointers)
			if _, err = tx.Exec(ctx, `INSERT INTO record_revision_audits(id,project_id,record_id,actor_id,occurred_at,version,reason,pointers) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, id(), pid, record.ID, u.ID, a.Now(), record.Version+1, reason, pointers); err != nil {
				configurationFailure(w, err)
				return
			}
			// Internal secret removal also covers archived linked copies, but
			// their identity remains hidden from all current callers.
			var visible bool
			if err = tx.QueryRow(ctx, `SELECT archived_at IS NULL FROM records WHERE project_id=$1 AND id=$2`, pid, record.ID).Scan(&visible); err != nil {
				configurationFailure(w, err)
				return
			}
			if visible && (record.Metadata.Visibility == "project" || record.OwnerID == u.ID) {
				affected = append(affected, wire.AffectedRecord{ID: record.ID, Version: record.Version + 1})
			}
		}
	}
	sort.Slice(affected, func(i, j int) bool { return affected[i].ID < affected[j].ID })
	if input.RevisionKind == "metadata" {
		pointers, _ := json.Marshal([]string{})
		if _, err = tx.Exec(ctx, `INSERT INTO record_revision_audits(id,project_id,record_id,actor_id,occurred_at,version,reason,pointers) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, id(), pid, rid, u.ID, a.Now(), old.Version+1, reason, pointers); err != nil {
			configurationFailure(w, err)
			return
		}
	}
	receipt := wire.RecordOperationReceipt{OperationID: input.OperationID, TargetKind: "revision", TargetID: rid, FrozenDigest: sum, ResponsibleEndpoint: "browser", Status: "recorded", RecordID: rid, Version: old.Version + 1, Etag: configurationETag(rid, old.Version+1), RecordedAt: a.Now().UTC().Format(time.RFC3339Nano), AffectedRecords: affected}
	if err = storeOperation(ctx, tx, pid, u.ID, old.ConnectionID, receipt); err != nil {
		configurationFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "record.revised", rid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	// Authorized additional redaction removes existing data and safe audit
	// reasons. Its validated, bounded audit overhead must never undo privacy
	// cleanup solely because an administrator lowered the capacity limit.
	if input.RevisionKind != "additional-redaction" && !a.checkRecordCapacity(w, r, tx, false) {
		return
	}
	configurationCommit(w, r, tx, receipt, receipt.Etag)
}
func snapshotObject(snapshot wire.ExecutionSnapshot) (map[string]any, error) {
	object := map[string]any{"context": snapshotContextObject(snapshot)}
	for key, raw := range map[string]string{"request": snapshot.RequestJSON, "response": snapshot.ResponseJSON, "protocol": snapshot.ProtocolJSON, "schema": snapshot.InputSchemaJSON} {
		if raw == "" {
			raw = "null"
		}
		v, err := recording.Parse(raw, false)
		if err != nil {
			return nil, err
		}
		object[key] = v
	}
	return object, nil
}
func (a *App) pinRecord(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, true, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	rid := r.PathValue("recordId")
	old, err := recordValue(ctx, tx, pid, rid, u.ID)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if old.Kind != "history" || old.Metadata.Visibility != "project" {
		fail(w, 400, "invalid_pin_target")
		return
	}
	if !configurationMatch(w, r, rid, old.Version) {
		return
	}
	var input wire.RecordPinInput
	if !decode(w, r, &input) {
		return
	}
	if _, err = tx.Exec(ctx, `UPDATE records SET pinned=$3,version=version+1,updated_at=$4 WHERE project_id=$1 AND id=$2`, pid, rid, input.Pinned, a.Now()); err != nil {
		configurationFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "record.pin", rid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	updated, err := recordValue(ctx, tx, pid, rid, u.ID)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if !a.checkRecordCapacity(w, r, tx, false) {
		return
	}
	configurationCommit(w, r, tx, updated, updated.Etag)
}
func (a *App) deleteRecord(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, false, true)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	rid := r.PathValue("recordId")
	old, err := recordValue(ctx, tx, pid, rid, u.ID)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if !recordWritable(old, u.ID, scope.projectRole) || old.Kind == "history" && scope.projectRole != "maintainer" {
		fail(w, 403, "forbidden")
		return
	}
	if !configurationMatch(w, r, rid, old.Version) {
		return
	}
	if old.Pinned {
		fail(w, 409, "record_pinned")
		return
	}
	if err = a.clearRecords(ctx, tx, `project_id=$1 AND id=$2`, pid, rid); err != nil {
		configurationFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "record.deleted", rid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, wire.Accepted{Ok: true}, "")
}
func (a *App) listRecordAudits(w http.ResponseWriter, r *http.Request) {
	tx, u, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	rid := r.PathValue("recordId")
	if _, err := recordValue(ctx, tx, pid, rid, u.ID); err != nil {
		configurationFailure(w, err)
		return
	}
	rows, err := tx.Query(ctx, `SELECT a.id,a.record_id,a.actor_id,u.name,a.occurred_at,a.version,a.reason,a.pointers FROM record_revision_audits a JOIN users u ON u.id=a.actor_id WHERE a.project_id=$1 AND a.record_id=$2 ORDER BY a.occurred_at,a.id`, pid, rid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	items := []wire.RecordRevisionAudit{}
	for rows.Next() {
		var audit wire.RecordRevisionAudit
		var occurred time.Time
		var pointers []byte
		if err = rows.Scan(&audit.ID, &audit.RecordID, &audit.ActorID, &audit.ActorName, &occurred, &audit.Version, &audit.Reason, &pointers); err != nil {
			rows.Close()
			configurationFailure(w, err)
			return
		}
		if err = json.Unmarshal(pointers, &audit.Pointers); err != nil {
			rows.Close()
			configurationFailure(w, err)
			return
		}
		audit.ActorName = safeRecordText(audit.ActorName)
		audit.OccurredAt = occurred.UTC().Format(time.RFC3339Nano)
		items = append(items, audit)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, items, "")
}
func (a *App) getRecordPolicy(w http.ResponseWriter, r *http.Request) {
	tx, _, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	policy, err := recordPolicy(r.Context(), tx, r.PathValue("projectId"))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, policy, policy.Etag)
}
func (a *App) updateRecordPolicy(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, true, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	old, err := recordPolicy(ctx, tx, pid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	if !configurationMatch(w, r, "policy:"+pid, old.Version) {
		return
	}
	var input wire.RecordRedactionPolicyInput
	if !decode(w, r, &input) {
		return
	}
	if len(input.Pointers) > 128 {
		fail(w, 400, "invalid_pointer")
		return
	}
	unique := map[string]bool{}
	for _, path := range input.Pointers {
		parts, err := recording.Pointer(path)
		if err != nil || len(path) > 1024 || len(parts) == 0 || !oneOf(parts[0], "request", "response", "protocol", "metadata", "context") {
			fail(w, 400, "invalid_pointer")
			return
		}
		unique[path] = true
	}
	for _, path := range old.Pointers {
		if !unique[path] {
			fail(w, 400, "redaction_cannot_remove")
			return
		}
	}
	pointers := []string{}
	for path := range unique {
		pointers = append(pointers, path)
	}
	sort.Strings(pointers)
	body, _ := json.Marshal(pointers)
	if _, err = tx.Exec(ctx, `INSERT INTO record_redaction_policies(project_id,version,pointers) VALUES($1,$2,$3) ON CONFLICT(project_id) DO UPDATE SET version=excluded.version,pointers=excluded.pointers`, pid, old.Version+1, body); err != nil {
		configurationFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "record.policy", pid, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	updated, err := recordPolicy(ctx, tx, pid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, updated, updated.Etag)
}

func safeRecordMetadataSources(metadata wire.RecordMetadata, secrets []string) wire.RecordMetadata {
	metadata.Name = safeSourceText(metadata.Name, secrets)
	metadata.Note = safeSourceText(metadata.Note, secrets)
	return metadata
}
func safeSourceText(text string, secrets []string) string {
	result, err := recording.Redact(text, recording.Options{SecretValues: secrets})
	if err != nil {
		return "[REDACTED]"
	}
	if s, ok := result.Value.(string); ok {
		return s
	}
	return "[REDACTED]"
}
func redactPriorAuditReasons(ctx context.Context, tx pgx.Tx, pid, rid string, secrets []string) error {
	rows, err := tx.Query(ctx, `SELECT id,reason FROM record_revision_audits WHERE project_id=$1 AND record_id=$2`, pid, rid)
	if err != nil {
		return err
	}
	type entry struct{ id, reason string }
	entries := []entry{}
	for rows.Next() {
		var e entry
		if err = rows.Scan(&e.id, &e.reason); err != nil {
			rows.Close()
			return err
		}
		entries = append(entries, e)
	}
	rows.Close()
	if err = rows.Err(); err != nil {
		return err
	}
	for _, e := range entries {
		safe := safeSourceText(e.reason, secrets)
		if safe != e.reason {
			if _, err = tx.Exec(ctx, `UPDATE record_revision_audits SET reason=$3 WHERE project_id=$1 AND id=$2`, pid, e.id, safe); err != nil {
				return err
			}
		}
	}
	return nil
}
