CREATE TABLE project_skill_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  version TEXT NOT NULL CHECK (length(trim(version)) BETWEEN 1 AND 64),
  content_digest TEXT NOT NULL CHECK (length(content_digest) = 64),
  files_json TEXT NOT NULL CHECK (
    json_valid(files_json)
    AND json_type(files_json) = 'object'
    AND length(CAST(files_json AS BLOB)) <= 1048576
  ),
  created_at TEXT NOT NULL,
  published_at TEXT,
  UNIQUE(project_id, id),
  UNIQUE(project_id, skill_id, revision),
  UNIQUE(project_id, skill_id, revision, content_digest),
  FOREIGN KEY(project_id, skill_id)
    REFERENCES project_skills(project_id, id) ON DELETE CASCADE
);

CREATE TABLE project_skills (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('STANDARD', 'USER')),
  standard_key TEXT,
  slug TEXT NOT NULL CHECK (
    length(slug) BETWEEN 1 AND 63
    AND slug = lower(slug)
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND substr(slug, 1, 1) <> '-'
    AND substr(slug, -1, 1) <> '-'
    AND instr(slug, '--') = 0
  ),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (length(description) <= 1024),
  state TEXT NOT NULL CHECK (state IN ('ACTIVE', 'DISABLED', 'DEPRECATED', 'DELETED')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  published_revision INTEGER CHECK (published_revision IS NULL OR published_revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(project_id, id),
  UNIQUE(project_id, slug),
  UNIQUE(project_id, standard_key),
  CHECK ((origin = 'STANDARD' AND standard_key IS NOT NULL AND length(trim(standard_key)) BETWEEN 1 AND 200)
    OR (origin = 'USER' AND standard_key IS NULL)),
  CHECK (state <> 'DEPRECATED' OR origin = 'STANDARD'),
  CHECK (state <> 'DELETED' OR origin = 'USER'),
  CHECK ((state = 'DELETED' AND deleted_at IS NOT NULL) OR (state <> 'DELETED' AND deleted_at IS NULL)),
  CHECK (published_revision IS NULL OR published_revision <= revision),
  FOREIGN KEY(project_id, id, published_revision)
    REFERENCES project_skill_revisions(project_id, skill_id, revision) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX project_skills_list_idx
ON project_skills(project_id, updated_at DESC, id DESC);

CREATE INDEX project_skills_origin_state_list_idx
ON project_skills(project_id, origin, state, updated_at DESC, id DESC);

CREATE TABLE project_skill_validations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  content_digest TEXT NOT NULL CHECK (length(content_digest) = 64),
  validation_digest TEXT NOT NULL CHECK (length(validation_digest) = 64),
  valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
  issues_json TEXT NOT NULL CHECK (
    json_valid(issues_json)
    AND json_type(issues_json) = 'array'
    AND length(CAST(issues_json AS BLOB)) <= 262144
  ),
  created_at TEXT NOT NULL,
  UNIQUE(project_id, id),
  UNIQUE(project_id, skill_id, revision, content_digest, validation_digest),
  FOREIGN KEY(project_id, skill_id, revision, content_digest)
    REFERENCES project_skill_revisions(project_id, skill_id, revision, content_digest) ON DELETE CASCADE
);

CREATE INDEX project_skill_validations_revision_idx
ON project_skill_validations(project_id, skill_id, revision, created_at DESC, id DESC);

CREATE TABLE project_skill_mutation_keys (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  response_json TEXT NOT NULL CHECK (
    json_valid(response_json)
    AND length(CAST(response_json AS BLOB)) <= 1048576
  ),
  created_at TEXT NOT NULL,
  PRIMARY KEY(project_id, idempotency_key)
);

CREATE TRIGGER project_skill_revisions_immutable
BEFORE UPDATE OF id, project_id, skill_id, revision, version, content_digest, files_json, created_at
ON project_skill_revisions
BEGIN
  SELECT RAISE(ABORT, 'Project Skill revision is immutable');
END;

CREATE TRIGGER project_skill_revisions_publish_once
BEFORE UPDATE OF published_at ON project_skill_revisions
WHEN OLD.published_at IS NOT NULL OR NEW.published_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'Project Skill publication timestamp is immutable');
END;

CREATE TRIGGER project_skill_revisions_append_only
BEFORE DELETE ON project_skill_revisions
BEGIN
  SELECT RAISE(ABORT, 'Project Skill revision is append-only');
END;

CREATE TRIGGER project_skill_validations_immutable
BEFORE UPDATE ON project_skill_validations
BEGIN
  SELECT RAISE(ABORT, 'Project Skill validation is immutable');
END;

CREATE TRIGGER project_skill_validations_append_only
BEFORE DELETE ON project_skill_validations
BEGIN
  SELECT RAISE(ABORT, 'Project Skill validation is append-only');
END;
