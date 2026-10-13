package platform

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"mcp-studio/internal/jsonnumber"
	"mcp-studio/internal/recording"
	"mcp-studio/internal/schema"
	"mcp-studio/internal/wire"
	"net/http"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (a *App) recordRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/projects/{projectId}/record-capacity", a.getRecordCapacity)
	mux.HandleFunc("PATCH /api/v1/projects/{projectId}/record-capacity", a.updateRecordRetention)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/record-uploads", a.uploadRecord)
	mux.HandleFunc("POST /api/v1/projects/{projectId}/records/{recordId}/revisions", a.reviseRecord)
	mux.HandleFunc("PATCH /api/v1/projects/{projectId}/records/{recordId}/pin", a.pinRecord)
	mux.HandleFunc("DELETE /api/v1/projects/{projectId}/records/{recordId}", a.deleteRecord)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/records/{recordId}/audits", a.listRecordAudits)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/record-redaction-policy", a.getRecordPolicy)
	mux.HandleFunc("PATCH /api/v1/projects/{projectId}/record-redaction-policy", a.updateRecordPolicy)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/record-operations/{operationId}", a.getRecordOperation)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/records", a.listRecords)
	mux.HandleFunc("GET /api/v1/projects/{projectId}/records/{recordId}", a.getRecord)
}

func decodeRecord(w http.ResponseWriter, r *http.Request, value any) (string, bool) {
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		fail(w, 415, "json_required")
		return "", false
	}
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 32<<20))
	if err != nil {
		fail(w, 400, "invalid_record_input")
		return "", false
	}
	parsed, err := recording.Parse(string(raw), true)
	if err != nil || !recordShape(parsed, reflect.TypeOf(value).Elem()) {
		fail(w, 400, "invalid_record_input")
		return "", false
	}
	d := json.NewDecoder(bytes.NewReader(raw))
	d.DisallowUnknownFields()
	if err = d.Decode(value); err != nil {
		fail(w, 400, "invalid_record_input")
		return "", false
	}
	sum, err := recording.Digest(string(raw))
	if err != nil {
		fail(w, 400, "invalid_record_input")
		return "", false
	}
	return sum, true
}
func recordShape(value any, typ reflect.Type) bool {
	switch typ.Kind() {
	case reflect.Struct:
		object, ok := value.(map[string]any)
		if !ok || len(object) != typ.NumField() {
			return false
		}
		for i := 0; i < typ.NumField(); i++ {
			field := typ.Field(i)
			key := strings.Split(field.Tag.Get("json"), ",")[0]
			child, ok := object[key]
			if !ok || !recordShape(child, field.Type) {
				return false
			}
		}
	case reflect.Slice:
		array, ok := value.([]any)
		if !ok {
			return false
		}
		for _, child := range array {
			if !recordShape(child, typ.Elem()) {
				return false
			}
		}
	case reflect.String:
		_, ok := value.(string)
		return ok
	case reflect.Bool:
		_, ok := value.(bool)
		return ok
	case reflect.Int:
		_, ok := value.(json.Number)
		return ok
	default:
		return false
	}
	return true
}

var recordID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

func validRecordID(id string) bool { return recordID.MatchString(id) }
func oneOf(s string, values ...string) bool {
	for _, v := range values {
		if s == v {
			return true
		}
	}
	return false
}

func uploadValidation(input wire.RecordUploadInput, pid, uid string) string {
	s := input.Snapshot
	m := input.Metadata
	if input.ContractVersion != "1.2.0" || input.ProjectID != pid || input.UserID != uid || s.ProjectID != pid || s.ConnectionID != input.ConnectionID || input.SourceRunID == "" && s.UserID != uid {
		return "identity_mismatch"
	}
	for _, value := range []string{input.UserID, pid, input.ConnectionID, input.OperationID, input.TargetID, s.TabID} {
		if !validRecordID(value) {
			return "invalid_identity"
		}
	}
	if !oneOf(input.TargetKind, "history", "saved") || !oneOf(input.ResponsibleEndpoint, "browser", "agent") || (input.TargetKind == "history" && input.ResponsibleEndpoint != s.Executor) || !oneOf(s.CredentialSource, "none", "token", "oauth", "reference") || !oneOf(s.RunStatus, "idle", "succeeded", "failed", "cancelled") || !oneOf(s.RemoteOutcome, "known", "unknown") || !oneOf(s.ResultKind, "none", "success", "tool_error", "rpc_error", "http_error", "network_error", "cancelled", "timeout", "output_invalid") || !oneOf(s.ResponseRetention, "full", "omitted") {
		return "invalid_snapshot"
	}
	if !oneOf(m.Visibility, "private", "project") || !oneOf(m.ContentKind, "request", "request-response") || !oneOf(m.Completeness, "complete", "incomplete") || len(m.Name) > 200 || len(m.Note) > 4096 || strings.TrimSpace(m.Name) == "" || len(s.ToolName) == 0 || len(s.ToolName) > 256 || s.ConfigurationVersion < 1 || s.ConfigurationVersion > 9007199254740991 || s.HttpStatus < 0 || s.HttpStatus > 599 || len(s.ToolDefinitionVersion) > 256 || len(s.EnvironmentVersion) > 256 || len(s.OmissionReason) > 512 || len(s.Redactions) > 4096 {
		return "invalid_snapshot"
	}
	if input.TargetID == input.OperationID || input.TargetID == s.RunID || input.OperationID == s.RunID || s.TabID == s.RunID {
		return "invalid_identity"
	}
	if input.TargetKind == "history" {
		if s.RunStatus == "idle" || !validRecordID(s.RunID) || input.SourceRunID != "" {
			return "invalid_history"
		}
	}
	if s.RunStatus != "idle" {
		started, e1 := time.Parse(time.RFC3339Nano, s.StartedAt)
		finished, e2 := time.Parse(time.RFC3339Nano, s.FinishedAt)
		if e1 != nil || e2 != nil || finished.Before(started) {
			return "invalid_timestamps"
		}
	}
	if len(s.RequestJSON) > 1<<20 || len(s.InputSchemaJSON) > 1<<20 || len(s.ProtocolJSON) > 1<<20 || len(s.ResponseJSON) > 10<<20 {
		return "record_size_limit"
	}
	if m.Visibility == "project" && m.Completeness == "incomplete" {
		return "incomplete_requires_private"
	}
	if s.ResponseRetention == "omitted" && s.OmissionReason == "" {
		return "omission_reason_required"
	}
	return ""
}

func scanRecord(row pgx.Row) (wire.Record, error) {
	var result wire.Record
	var body []byte
	var created, updated time.Time
	if err := row.Scan(&result.ID, &result.ProjectID, &result.ConnectionID, &result.OwnerID, &result.OwnerName, &result.Kind, &result.Version, &created, &updated, &result.Pinned, &result.SourceRunID, &body); err != nil {
		return result, err
	}
	var content struct {
		Snapshot wire.ExecutionSnapshot `json:"snapshot"`
		Metadata wire.RecordMetadata    `json:"metadata"`
	}
	if err := json.Unmarshal(body, &content); err != nil {
		return result, err
	}
	result.Snapshot = content.Snapshot
	result.Metadata = content.Metadata
	result.OwnerName = safeRecordText(result.OwnerName)
	result.CreatedAt = created.UTC().Format(time.RFC3339Nano)
	result.UpdatedAt = updated.UTC().Format(time.RFC3339Nano)
	result.Etag = configurationETag(result.ID, result.Version)
	return result, nil
}

const recordColumns = `r.id,r.project_id,r.connection_id,r.owner_id,u.name,r.kind,r.version,r.created_at,r.updated_at,r.pinned,r.source_run_id,r.body`

func recordValue(ctx context.Context, q queryRower, pid, rid, uid string) (wire.Record, error) {
	return scanRecord(q.QueryRow(ctx, `SELECT `+recordColumns+` FROM records r JOIN users u ON u.id=r.owner_id WHERE r.project_id=$1 AND r.id=$2 AND r.archived_at IS NULL AND (r.visibility='project' OR r.owner_id=$3)`, pid, rid, uid))
}
func recordBody(snapshot wire.ExecutionSnapshot, metadata wire.RecordMetadata) []byte {
	body, _ := json.Marshal(struct {
		Snapshot wire.ExecutionSnapshot `json:"snapshot"`
		Metadata wire.RecordMetadata    `json:"metadata"`
	}{snapshot, metadata})
	return body
}

func operationValue(ctx context.Context, q queryRower, op string) (wire.RecordOperationReceipt, string, string, string, error) {
	var receipt wire.RecordOperationReceipt
	var pid, uid, cid string
	var body []byte
	err := q.QueryRow(ctx, `SELECT project_id,user_id,connection_id,receipt FROM record_operations WHERE operation_id=$1`, op).Scan(&pid, &uid, &cid, &body)
	if err == nil {
		err = json.Unmarshal(body, &receipt)
	}
	return receipt, pid, uid, cid, err
}
func replayOperation(w http.ResponseWriter, r *http.Request, tx pgx.Tx, op, pid, uid, cid, target, sum, endpoint string) bool {
	receipt, p, u, c, err := operationValue(r.Context(), tx, op)
	if errors.Is(err, pgx.ErrNoRows) {
		return false
	}
	if err != nil {
		configurationFailure(w, err)
		return true
	}
	if p != pid || u != uid || c != cid || receipt.TargetID != target || receipt.ResponsibleEndpoint != endpoint {
		fail(w, 409, "identity_conflict")
		return true
	}
	if receipt.FrozenDigest != sum {
		fail(w, 409, "digest_conflict")
		return true
	}
	configurationCommit(w, r, tx, receipt, receipt.Etag)
	return true
}
func storeOperation(ctx context.Context, tx pgx.Tx, pid, uid, cid string, receipt wire.RecordOperationReceipt) error {
	body, err := json.Marshal(receipt)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `INSERT INTO record_operations(operation_id,project_id,user_id,connection_id,target_id,frozen_digest,responsible_endpoint,receipt) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, receipt.OperationID, pid, uid, cid, receipt.TargetID, receipt.FrozenDigest, receipt.ResponsibleEndpoint, body)
	return err
}

func (a *App) uploadRecord(w http.ResponseWriter, r *http.Request) {
	tx, u, scope, ok := a.configurationTx(w, r, false, true)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	ctx := r.Context()
	pid := r.PathValue("projectId")
	var input wire.RecordUploadInput
	sum, ok := decodeRecord(w, r, &input)
	if !ok {
		return
	}
	if (agentFrom(r) == nil && (input.ResponsibleEndpoint != "browser" || input.TargetKind == "history" && input.Snapshot.Executor != "browser")) || (agentFrom(r) != nil && (input.ResponsibleEndpoint != "agent" || input.TargetKind != "history" || input.Snapshot.Executor != "agent" || input.Snapshot.UserID != u.ID)) {
		fail(w, 403, "executor_not_authenticated")
		return
	}
	if code := uploadValidation(input, pid, u.ID); code != "" {
		fail(w, 400, code)
		return
	}
	if sum != input.FrozenDigest {
		fail(w, 409, "digest_conflict")
		return
	}
	if replayOperation(w, r, tx, input.OperationID, pid, u.ID, input.ConnectionID, input.TargetID, sum, input.ResponsibleEndpoint) {
		return
	}
	if input.TargetKind == "saved" && input.Metadata.Visibility == "project" && scope.projectRole != "maintainer" {
		fail(w, 403, "forbidden")
		return
	}
	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM record_tombstones WHERE id=$1 OR (kind='history' AND $2='history' AND project_id=$3 AND owner_id=$4 AND connection_id=$5 AND run_id=$6)) OR EXISTS(SELECT 1 FROM records WHERE id=$1 OR (kind='history' AND $2='history' AND project_id=$3 AND owner_id=$4 AND connection_id=$5 AND run_id=$6))`, input.TargetID, input.TargetKind, pid, u.ID, input.ConnectionID, input.Snapshot.RunID).Scan(&exists); err != nil {
		configurationFailure(w, err)
		return
	}
	if exists {
		fail(w, 409, "identity_conflict")
		return
	}
	policy, err := recordPolicy(ctx, tx, pid)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	input.Metadata.Name = strings.TrimSpace(input.Metadata.Name)
	sourceSecrets := []string{}
	if input.SourceRunID != "" {
		if input.SourceRunID != input.Snapshot.RunID || !validRecordID(input.SourceRunID) {
			fail(w, 400, "invalid_source")
			return
		}
		var sourceID string
		sourceErr := tx.QueryRow(ctx, `SELECT id FROM records WHERE project_id=$1 AND connection_id=$2 AND kind='history' AND run_id=$3 AND archived_at IS NULL AND (visibility='project' OR owner_id=$4)`, pid, input.ConnectionID, input.SourceRunID, u.ID).Scan(&sourceID)
		if sourceErr != nil {
			var unavailable bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM records WHERE project_id=$1 AND connection_id=$2 AND run_id=$3 AND kind='history' AND archived_at IS NOT NULL) OR EXISTS(SELECT 1 FROM record_tombstones WHERE project_id=$1 AND connection_id=$2 AND run_id=$3 AND kind='history')`, pid, input.ConnectionID, input.SourceRunID).Scan(&unavailable); err != nil {
				configurationFailure(w, err)
				return
			}
			if unavailable {
				fail(w, 400, "invalid_source")
				return
			}
			if !errors.Is(sourceErr, pgx.ErrNoRows) || input.Snapshot.UserID != u.ID || !configurationReference(ctx, tx, "connections", pid, input.ConnectionID) {
				fail(w, 400, "invalid_source")
				return
			}
		} else {
			source, err := recordValue(ctx, tx, pid, sourceID, u.ID)
			if err != nil {
				configurationFailure(w, err)
				return
			}
			wrapper, err := snapshotObject(source.Snapshot)
			if err != nil {
				configurationFailure(w, err)
				return
			}
			delete(wrapper, "schema")
			wrapper["metadata"] = metadataObject(input.Metadata)
			sourceSecrets = recording.SensitiveValues(wrapper, recording.Options{ProjectPointers: policy.Pointers})
			expected, _, err := safeSnapshotMetadata(source.Snapshot, input.Metadata, policy.Pointers, nil, sourceSecrets)
			if err != nil {
				configurationFailure(w, err)
				return
			}
			same, err := sameSourceSnapshot(expected, input.Snapshot, input.Metadata.ContentKind == "request")
			if err != nil || !same {
				fail(w, 400, "invalid_source")
				return
			}

		}
	} else if !configurationReference(ctx, tx, "connections", pid, input.ConnectionID) {
		fail(w, 400, "invalid_scope")
		return
	}
	if _, err := recording.Parse(input.Snapshot.RequestJSON, false); err != nil {
		fail(w, 400, "invalid_request_json")
		return
	}
	valid := schema.Check(input.Snapshot.InputSchemaJSON, input.Snapshot.RequestJSON)
	if input.Snapshot.RunStatus == "idle" && (!valid.Supported || !valid.Valid) {
		if input.Metadata.Visibility != "private" {
			fail(w, 400, "incomplete_requires_private")
			return
		}
		input.Metadata.Completeness = "incomplete"
		input.Snapshot.SchemaValid = false
	}

	snapshot, metadata, err := safeSnapshotMetadata(input.Snapshot, input.Metadata, policy.Pointers, nil, sourceSecrets)
	if err != nil {
		fail(w, 400, "invalid_snapshot_json")
		return
	}
	if input.TargetKind == "saved" && metadata.ContentKind == "request" {
		snapshot.ResponseJSON = "null"
		snapshot.ProtocolJSON = "null"
		snapshot.ResponseRetention = "omitted"
		snapshot.OmissionReason = "request_only"
		kept := []wire.RedactionMarker{}
		for _, marker := range snapshot.Redactions {
			if !strings.HasPrefix(marker.Path, "/response") && !strings.HasPrefix(marker.Path, "/protocol") {
				kept = append(kept, marker)
			}
		}
		snapshot.Redactions = kept
	}
	now := a.Now().UTC()
	_, err = tx.Exec(ctx, `INSERT INTO records(id,project_id,connection_id,owner_id,kind,run_id,source_run_id,visibility,version,created_at,updated_at,pinned,body) VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9,false,$10)`, input.TargetID, pid, input.ConnectionID, u.ID, input.TargetKind, snapshot.RunID, input.SourceRunID, metadata.Visibility, now, recordBody(snapshot, metadata))
	if err != nil {
		configurationFailure(w, err)
		return
	}
	receipt := wire.RecordOperationReceipt{OperationID: input.OperationID, TargetKind: input.TargetKind, TargetID: input.TargetID, FrozenDigest: sum, ResponsibleEndpoint: input.ResponsibleEndpoint, Status: "recorded", RecordID: input.TargetID, Version: 1, Etag: configurationETag(input.TargetID, 1), RecordedAt: now.Format(time.RFC3339Nano), AffectedRecords: []wire.AffectedRecord{{ID: input.TargetID, Version: 1}}}
	if err = storeOperation(ctx, tx, pid, u.ID, input.ConnectionID, receipt); err != nil {
		configurationFailure(w, err)
		return
	}
	if err = audit(ctx, tx, scope.teamID, pid, u.ID, "record.uploaded", input.TargetID, ""); err != nil {
		configurationFailure(w, err)
		return
	}
	if !a.checkRecordCapacity(w, r, tx, false) {
		return
	}
	configurationCommit(w, r, tx, receipt, receipt.Etag)
}
func safeRecordText(s string) string {
	result, err := recording.Redact(s, recording.Options{})
	if err != nil {
		return "[REDACTED]"
	}
	if value, ok := result.Value.(string); ok {
		return value
	}
	return "[REDACTED]"
}
func recordPolicy(ctx context.Context, q queryRower, pid string) (wire.RecordRedactionPolicy, error) {
	policy := wire.RecordRedactionPolicy{ProjectID: pid, Version: 1, Pointers: []string{}}
	var body []byte
	err := q.QueryRow(ctx, `SELECT version,pointers FROM record_redaction_policies WHERE project_id=$1`, pid).Scan(&policy.Version, &body)
	if errors.Is(err, pgx.ErrNoRows) {
		err = nil
	} else if err == nil {
		err = json.Unmarshal(body, &policy.Pointers)
	}
	policy.Etag = configurationETag("policy:"+pid, policy.Version)
	return policy, err
}
func safeSnapshotMetadata(snapshot wire.ExecutionSnapshot, metadata wire.RecordMetadata, project, additional, secrets []string) (wire.ExecutionSnapshot, wire.RecordMetadata, error) {
	value, err := snapshotObject(snapshot)
	if err != nil {
		return snapshot, metadata, err
	}
	delete(value, "schema")
	value["metadata"] = metadataObject(metadata)
	original := map[string]string{"request": snapshot.RequestJSON, "response": snapshot.ResponseJSON, "protocol": snapshot.ProtocolJSON}
	incoming := map[string]string{}
	schemaMarked := false
	for _, marker := range snapshot.Redactions {
		parts, err := recording.Pointer(marker.Path)
		if err != nil || len(parts) == 0 || !oneOf(parts[0], "request", "response", "protocol", "metadata", "context", "schema") || !oneOf(marker.Reason, "default", "source", "project", "additional", "omitted") {
			return snapshot, metadata, errors.New("invalid marker")
		}
		if parts[0] == "schema" {
			schemaMarked = true
			continue
		}
		if _, exists := recording.ValueAt(value, parts); !exists {
			return snapshot, metadata, errors.New("invalid marker")
		}
		incoming[marker.Path] = marker.Reason
		additional = append(additional, marker.Path)
	}
	options := recording.Options{SecretValues: secrets, ProjectPointers: project, AdditionalPointers: additional}
	sources := recording.SensitiveValues(value, options)
	schemaJSON, schemaSanitized, err := sanitizeRecordSchema(snapshot.InputSchemaJSON, sources)
	if err != nil {
		return snapshot, metadata, err
	}
	snapshot.InputSchemaJSON = schemaJSON
	result, err := recording.Redact(value, options)
	if err != nil {
		return snapshot, metadata, err
	}
	if result.Omitted || recording.IsMarker(result.Value) {
		snapshot.RequestJSON = `{"$redacted":true}`
		snapshot.ResponseJSON = "null"
		snapshot.ProtocolJSON = "null"
		snapshot.InputSchemaJSON = "{}"
		snapshot.ResponseRetention = "omitted"
		snapshot.OmissionReason = "complexity_limit"
		snapshot.Redactions = []wire.RedactionMarker{{Path: "/request", Reason: "omitted"}, {Path: "/response", Reason: "omitted"}, {Path: "/protocol", Reason: "omitted"}, {Path: "/schema", Reason: "omitted"}}
		metadata.Name = "[REDACTED]"
		metadata.Note = "[REDACTED]"
		snapshot.ToolName = "[REDACTED]"
		snapshot.ToolDefinitionVersion = "[REDACTED]"
		snapshot.EnvironmentVersion = "[REDACTED]"
		snapshot.Redactions = append(snapshot.Redactions, wire.RedactionMarker{Path: "/context", Reason: "omitted"})
		return snapshot, metadata, nil
	}
	safe := result.Value.(map[string]any)
	for key, old := range original {
		newValue := recording.Encode(safe[key])
		if recording.Encode(value[key]) == newValue && old != "" {
			newValue = old
		}
		switch key {
		case "request":
			snapshot.RequestJSON = newValue
		case "response":
			snapshot.ResponseJSON = newValue
		case "protocol":
			snapshot.ProtocolJSON = newValue
		}
	}
	if safeMetadata, ok := safe["metadata"].(map[string]any); ok && !recording.IsMarker(safeMetadata) {
		for key, destination := range map[string]*string{"name": &metadata.Name, "note": &metadata.Note} {
			if text, ok := safeMetadata[key].(string); ok {
				*destination = text
			} else {
				*destination = "[REDACTED]"
			}
		}
	} else {
		metadata.Name = "[REDACTED]"
		metadata.Note = "[REDACTED]"
	}

	if context, ok := safe["context"].(map[string]any); ok && !recording.IsMarker(context) {
		for key, destination := range map[string]*string{"toolName": &snapshot.ToolName, "toolDefinitionVersion": &snapshot.ToolDefinitionVersion, "environmentVersion": &snapshot.EnvironmentVersion, "omissionReason": &snapshot.OmissionReason} {
			if text, ok := context[key].(string); ok {
				*destination = text
			} else {
				*destination = "[REDACTED]"
			}
		}
	} else {
		snapshot.ToolName = "[REDACTED]"
		snapshot.ToolDefinitionVersion = "[REDACTED]"
		snapshot.EnvironmentVersion = "[REDACTED]"
		snapshot.OmissionReason = "[REDACTED]"
	}
	snapshot.Redactions = result.Markers
	for i := range snapshot.Redactions {
		if reason, ok := incoming[snapshot.Redactions[i].Path]; ok {
			snapshot.Redactions[i].Reason = reason
		}
	}
	if schemaSanitized || schemaMarked {
		snapshot.Redactions = append(snapshot.Redactions, wire.RedactionMarker{Path: "/schema", Reason: "omitted"})
	}
	sort.Slice(snapshot.Redactions, func(i, j int) bool { return snapshot.Redactions[i].Path < snapshot.Redactions[j].Path })
	return snapshot, metadata, nil
}
func metadataObject(metadata wire.RecordMetadata) map[string]any {
	return map[string]any{"name": metadata.Name, "note": metadata.Note, "visibility": metadata.Visibility, "contentKind": metadata.ContentKind, "completeness": metadata.Completeness}
}

// Annotation omission preserves validation shape. Assertions containing an
// actual source secret cannot be edited while pretending to preserve schema
// semantics, so their persisted context is omitted as a whole.
func sanitizeRecordSchema(raw string, secrets []string) (string, bool, error) {
	value, err := recording.Parse(raw, false)
	if err != nil {
		return "", false, err
	}
	changed := false
	unsafeAssertion := false
	risky := func(v any) bool {
		result, err := recording.Redact(v, recording.Options{SecretValues: secrets})
		return err != nil || result.Omitted || len(result.Markers) > 0
	}
	var visit func(any, bool) any
	visit = func(v any, sensitiveProperty bool) any {
		object, ok := v.(map[string]any)
		if !ok {
			return v
		}
		out := map[string]any{}
		for key, child := range object {
			if oneOf(key, "default", "examples", "description", "title", "$comment") {
				if risky(child) || sensitiveProperty && oneOf(key, "default", "examples") {
					changed = true
					continue
				}
				out[key] = child
				continue
			}
			switch key {
			case "properties", "patternProperties", "$defs", "definitions", "dependentSchemas":
				if children, ok := child.(map[string]any); ok {
					mapping := map[string]any{}
					for name, sch := range children {
						mapping[name] = visit(sch, key == "properties" && recording.SensitiveName(name))
					}
					out[key] = mapping
				} else {
					out[key] = child
				}
			case "allOf", "anyOf", "oneOf", "prefixItems":
				if children, ok := child.([]any); ok {
					array := make([]any, len(children))
					for i, sch := range children {
						array[i] = visit(sch, sensitiveProperty)
					}
					out[key] = array
				} else {
					out[key] = child
				}
			case "items":
				if children, ok := child.([]any); ok {
					array := make([]any, len(children))
					for i, sch := range children {
						array[i] = visit(sch, sensitiveProperty)
					}
					out[key] = array
				} else {
					out[key] = visit(child, sensitiveProperty)
				}
			case "additionalProperties", "additionalItems", "unevaluatedProperties", "unevaluatedItems", "propertyNames", "contains", "if", "then", "else", "not", "contentSchema":
				out[key] = visit(child, sensitiveProperty)
			case "dependencies":
				if children, ok := child.(map[string]any); ok {
					mapping := map[string]any{}
					for name, dependency := range children {
						if _, array := dependency.([]any); array {
							mapping[name] = dependency
							if risky(dependency) {
								unsafeAssertion = true
							}
						} else {
							mapping[name] = visit(dependency, false)
						}
					}
					out[key] = mapping
				} else {
					out[key] = child
				}
			default:
				if risky(child) || sensitiveProperty && oneOf(key, "const", "enum") && len(recording.StringLeaves(child)) > 0 {
					unsafeAssertion = true
				}
				out[key] = child
			}
		}
		return out
	}
	safe := visit(value, false)
	if unsafeAssertion {
		return "{}", true, nil
	}
	if changed {
		return recording.Encode(safe), true, nil
	}
	return raw, false, nil
}
func (a *App) getRecordOperation(w http.ResponseWriter, r *http.Request) {
	tx, u, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	receipt, pid, uid, _, err := operationValue(r.Context(), tx, r.PathValue("operationId"))
	if err != nil || pid != r.PathValue("projectId") || uid != u.ID {
		fail(w, 404, "not_found")
		return
	}
	configurationCommit(w, r, tx, receipt, receipt.Etag)
}
func (a *App) getRecord(w http.ResponseWriter, r *http.Request) {
	tx, u, _, ok := a.configurationTx(w, r, false, false)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	value, err := recordValue(r.Context(), tx, r.PathValue("projectId"), r.PathValue("recordId"), u.ID)
	if err != nil {
		configurationFailure(w, err)
		return
	}
	configurationCommit(w, r, tx, value, value.Etag)
}

func requestOnlyMarkers(markers []wire.RedactionMarker) []wire.RedactionMarker {
	kept := []wire.RedactionMarker{}
	for _, marker := range markers {
		if !strings.HasPrefix(marker.Path, "/response") && !strings.HasPrefix(marker.Path, "/protocol") {
			kept = append(kept, marker)
		}
	}
	return kept
}

func executionMarkers(markers []wire.RedactionMarker) []wire.RedactionMarker {
	kept := []wire.RedactionMarker{}
	for _, marker := range markers {
		if marker.Path != "/metadata" && !strings.HasPrefix(marker.Path, "/metadata/") {
			kept = append(kept, marker)
		}
	}
	return kept
}

func snapshotContextObject(snapshot wire.ExecutionSnapshot) map[string]any {
	return map[string]any{"toolName": snapshot.ToolName, "toolDefinitionVersion": snapshot.ToolDefinitionVersion, "environmentVersion": snapshot.EnvironmentVersion, "omissionReason": snapshot.OmissionReason}
}

// JSON equality for source proof ignores member order and browser Number
// spelling. It never rewrites the frozen input strings or transport digest.
func sameSourceSnapshot(expected, actual wire.ExecutionSnapshot, requestOnly bool) (bool, error) {
	expected.Redactions = executionMarkers(expected.Redactions)
	actual.Redactions = executionMarkers(actual.Redactions)
	if requestOnly {
		actual.ResponseJSON = expected.ResponseJSON
		actual.ProtocolJSON = expected.ProtocolJSON
		actual.ResponseRetention = expected.ResponseRetention
		actual.OmissionReason = expected.OmissionReason
		expected.Redactions = requestOnlyMarkers(expected.Redactions)
		actual.Redactions = requestOnlyMarkers(actual.Redactions)
	}
	for _, pair := range [][2]*string{{&expected.RequestJSON, &actual.RequestJSON}, {&expected.InputSchemaJSON, &actual.InputSchemaJSON}, {&expected.ResponseJSON, &actual.ResponseJSON}, {&expected.ProtocolJSON, &actual.ProtocolJSON}} {
		for _, target := range pair {
			normalized, err := sourceJSON(*target)
			if err != nil {
				return false, err
			}
			*target = normalized
		}
	}
	return reflect.DeepEqual(expected, actual), nil
}
func sourceJSON(raw string) (string, error) {
	value, err := recording.Parse(raw, false)
	if err != nil {
		return "", err
	}
	var normalize func(any) (any, error)
	normalize = func(v any) (any, error) {
		switch x := v.(type) {
		case json.Number:
			return jsonnumber.Normalize(string(x))
		case map[string]any:
			for key, child := range x {
				next, err := normalize(child)
				if err != nil {
					return nil, err
				}
				x[key] = next
			}
		case []any:
			for index, child := range x {
				next, err := normalize(child)
				if err != nil {
					return nil, err
				}
				x[index] = next
			}
		}
		return v, nil
	}
	value, err = normalize(value)
	if err != nil {
		return "", err
	}
	return recording.Encode(value), nil
}
