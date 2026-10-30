CREATE TABLE ai_test_units (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connection_identity TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  next_version_number INTEGER NOT NULL DEFAULT 1 CHECK (next_version_number >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, id),
  UNIQUE(project_id, connection_identity, tool_name)
);

CREATE TABLE ai_test_unit_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number >= 1),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(CAST(payload_json AS BLOB)) <= 4194304),
  created_at TEXT NOT NULL,
  UNIQUE(project_id, id),
  UNIQUE(project_id, unit_id, version_number),
  FOREIGN KEY(project_id, unit_id) REFERENCES ai_test_units(project_id, id) ON DELETE CASCADE
);

CREATE TRIGGER ai_test_unit_versions_immutable
BEFORE UPDATE ON ai_test_unit_versions
BEGIN
  SELECT RAISE(ABORT, 'AI test versions are immutable');
END;

CREATE TABLE ai_test_version_mutations (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_digest TEXT NOT NULL CHECK (length(request_digest) = 64),
  version_id TEXT NOT NULL,
  PRIMARY KEY(project_id, idempotency_key),
  FOREIGN KEY(project_id, version_id) REFERENCES ai_test_unit_versions(project_id, id) ON DELETE CASCADE
);

CREATE INDEX ai_test_units_project_id_idx ON ai_test_units(project_id, id DESC);
