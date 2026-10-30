CREATE TABLE ai_test_rounds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  lease_epoch INTEGER NOT NULL DEFAULT 0,
  lease_token_hash TEXT,
  lease_session_id TEXT,
  lease_expires_at TEXT,
  UNIQUE(project_id, id),
  UNIQUE(project_id, idempotency_key),
  FOREIGN KEY(project_id, version_id) REFERENCES ai_test_unit_versions(project_id, id) ON DELETE CASCADE
);
CREATE TABLE ai_test_round_cases (
  project_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY(project_id, round_id, case_id),
  UNIQUE(project_id, round_id, ordinal),
  FOREIGN KEY(project_id, round_id) REFERENCES ai_test_rounds(project_id, id) ON DELETE CASCADE
);
CREATE TABLE ai_test_round_events (
  project_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  kind TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  PRIMARY KEY(project_id, round_id, sequence),
  FOREIGN KEY(project_id, round_id) REFERENCES ai_test_rounds(project_id, id) ON DELETE CASCADE
);
CREATE TRIGGER ai_test_round_events_immutable BEFORE UPDATE ON ai_test_round_events
BEGIN SELECT RAISE(ABORT, 'Round events are immutable'); END;

CREATE TABLE ai_test_calls (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  run_id TEXT REFERENCES runs(id) ON DELETE SET NULL,
  may_have_side_effects INTEGER NOT NULL CHECK(may_have_side_effects IN (0, 1)),
  outcome TEXT NOT NULL CHECK(outcome IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'NOT_SENT')),
  created_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  lineage_json TEXT NOT NULL CHECK(json_valid(lineage_json)),
  UNIQUE(project_id, id),
  UNIQUE(project_id, round_id, idempotency_key),
  FOREIGN KEY(project_id, round_id) REFERENCES ai_test_rounds(project_id, id) ON DELETE CASCADE
);
CREATE INDEX ai_test_calls_connection_budget ON ai_test_calls(project_id, connection_id, created_at);
CREATE TRIGGER ai_test_run_link AFTER INSERT ON run_ai_test_context
BEGIN
  UPDATE ai_test_calls SET run_id = NEW.run_id
    WHERE project_id = NEW.project_id AND round_id = NEW.round_id AND id = NEW.call_id;
END;
CREATE TABLE ai_test_resources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  created_by_call_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  UNIQUE(project_id, round_id, created_by_call_id, resource_id),
  FOREIGN KEY(project_id, round_id) REFERENCES ai_test_rounds(project_id, id) ON DELETE CASCADE,
  FOREIGN KEY(project_id, created_by_call_id) REFERENCES ai_test_calls(project_id, id) ON DELETE CASCADE
);

CREATE TABLE ai_test_case_result_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  evidence_state TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(evidence_state IN ('AVAILABLE', 'CLEARED', 'INCOMPLETE')),
  UNIQUE(project_id, round_id, case_id, revision),
  FOREIGN KEY(project_id, round_id, case_id) REFERENCES ai_test_round_cases(project_id, round_id, case_id) ON DELETE CASCADE
);
CREATE TRIGGER ai_test_results_immutable BEFORE UPDATE OF payload_json ON ai_test_case_result_revisions
BEGIN SELECT RAISE(ABORT, 'Result revisions are immutable'); END;
CREATE TABLE ai_test_conclusion_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision > 0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  UNIQUE(project_id, round_id, revision),
  FOREIGN KEY(project_id, round_id) REFERENCES ai_test_rounds(project_id, id) ON DELETE CASCADE
);
CREATE TRIGGER ai_test_conclusions_immutable BEFORE UPDATE ON ai_test_conclusion_revisions
BEGIN SELECT RAISE(ABORT, 'Conclusion revisions are immutable'); END;
CREATE TABLE ai_test_assessment_mutations (
  project_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('RESULT', 'CONCLUSION')),
  idempotency_key TEXT NOT NULL,
  digest TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  PRIMARY KEY(project_id, round_id, kind, idempotency_key),
  FOREIGN KEY(project_id, round_id) REFERENCES ai_test_rounds(project_id, id) ON DELETE CASCADE
);
