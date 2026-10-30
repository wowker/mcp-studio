-- Keep released runs.invocation_source CHECK and all existing Run references intact.
CREATE TABLE run_ai_test_context (
  run_id TEXT PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  round_id TEXT NOT NULL,
  call_id TEXT NOT NULL,
  context_json TEXT NOT NULL CHECK(json_valid(context_json)),
  dispatch_state TEXT NOT NULL DEFAULT 'SENT' CHECK(dispatch_state IN ('SENT', 'NOT_SENT')),
  UNIQUE(project_id, call_id)
);
CREATE INDEX run_ai_test_context_round ON run_ai_test_context(project_id, round_id);
CREATE TRIGGER run_ai_test_context_project_guard BEFORE INSERT ON run_ai_test_context
WHEN NOT EXISTS(SELECT 1 FROM runs WHERE id = NEW.run_id AND project_id = NEW.project_id)
BEGIN SELECT RAISE(ABORT, 'Run project mismatch'); END;
