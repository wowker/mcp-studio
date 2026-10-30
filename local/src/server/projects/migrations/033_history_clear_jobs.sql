CREATE TABLE history_clear_previews (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  created_at TEXT NOT NULL
);
CREATE TABLE history_clear_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  preview_id TEXT NOT NULL UNIQUE REFERENCES history_clear_previews(id),
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  UNIQUE(project_id, idempotency_key)
);

CREATE TABLE project_maintenance (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  active INTEGER NOT NULL CHECK(active IN (0, 1)),
  owner_pid INTEGER
);
INSERT INTO project_maintenance VALUES (1, 0, NULL);

CREATE TRIGGER maintenance_run_start BEFORE INSERT ON runs
WHEN (SELECT active FROM project_maintenance WHERE singleton = 1) = 1
BEGIN SELECT RAISE(ABORT, 'PROJECT_MAINTENANCE'); END;
CREATE TRIGGER maintenance_ai_call_start BEFORE INSERT ON ai_test_calls
WHEN (SELECT active FROM project_maintenance WHERE singleton = 1) = 1
BEGIN SELECT RAISE(ABORT, 'PROJECT_MAINTENANCE'); END;
CREATE TRIGGER maintenance_ai_round_start BEFORE INSERT ON ai_test_rounds
WHEN (SELECT active FROM project_maintenance WHERE singleton = 1) = 1
BEGIN SELECT RAISE(ABORT, 'PROJECT_MAINTENANCE'); END;
CREATE TRIGGER maintenance_workflow_start BEFORE INSERT ON workflow_executions
WHEN (SELECT active FROM project_maintenance WHERE singleton = 1) = 1
BEGIN SELECT RAISE(ABORT, 'PROJECT_MAINTENANCE'); END;
CREATE TRIGGER maintenance_test_start BEFORE INSERT ON test_executions
WHEN (SELECT active FROM project_maintenance WHERE singleton = 1) = 1
BEGIN SELECT RAISE(ABORT, 'PROJECT_MAINTENANCE'); END;
CREATE TRIGGER maintenance_suite_start BEFORE INSERT ON test_suite_executions
WHEN (SELECT active FROM project_maintenance WHERE singleton = 1) = 1
BEGIN SELECT RAISE(ABORT, 'PROJECT_MAINTENANCE'); END;
CREATE TRIGGER maintenance_pressure_start BEFORE INSERT ON pressure_test_executions
WHEN (SELECT active FROM project_maintenance WHERE singleton = 1) = 1
BEGIN SELECT RAISE(ABORT, 'PROJECT_MAINTENANCE'); END;
CREATE TRIGGER maintenance_authoring_start BEFORE INSERT ON authoring_tool_calls
WHEN (SELECT active FROM project_maintenance WHERE singleton = 1) = 1
BEGIN SELECT RAISE(ABORT, 'PROJECT_MAINTENANCE'); END;

-- Run removal keeps assessment prose, but never represents deleted evidence as complete.
CREATE TRIGGER ai_test_evidence_before_run_delete BEFORE DELETE ON runs
BEGIN
  UPDATE ai_test_case_result_revisions SET evidence_state = 'CLEARED'
    WHERE project_id = OLD.project_id AND round_id IN
      (SELECT round_id FROM ai_test_calls WHERE run_id = OLD.id);
  UPDATE ai_test_calls SET payload_json = json_set(payload_json,
    '$.payloadState', 'CLEARED', '$.originalRunId', OLD.id)
    WHERE run_id = OLD.id;
END;

-- Covers every Run deletion entry point, including future retention jobs.
CREATE TRIGGER ai_test_active_evidence_guard BEFORE DELETE ON runs
WHEN EXISTS (
  SELECT 1 FROM ai_test_calls c JOIN ai_test_rounds r ON r.id = c.round_id
  WHERE c.run_id = OLD.id AND (
    json_extract(r.payload_json, '$.state') NOT IN ('COMPLETED', 'CANCELLED') OR
    c.outcome IN ('PENDING', 'RUNNING') OR (c.outcome = 'UNKNOWN' AND c.may_have_side_effects = 1)
  )
)
BEGIN SELECT RAISE(ABORT, 'PROJECT_BUSY'); END;
