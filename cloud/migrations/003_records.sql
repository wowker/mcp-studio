CREATE TABLE records (
 id text PRIMARY KEY,
 sequence bigint GENERATED ALWAYS AS IDENTITY,
 project_id text NOT NULL REFERENCES projects(id),
 connection_id text NOT NULL,
 owner_id text NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('history','saved')),
 run_id text NOT NULL,
 source_run_id text NOT NULL,
 visibility text NOT NULL CHECK(visibility IN ('private','project')),
 version bigint NOT NULL CHECK(version > 0),
 created_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL,
 pinned boolean NOT NULL DEFAULT false,
 body jsonb NOT NULL,
 UNIQUE(project_id,id)
);
CREATE UNIQUE INDEX records_history_run ON records(owner_id,project_id,connection_id,run_id) WHERE kind='history';
CREATE INDEX records_project_order ON records(project_id,created_at DESC,id DESC);
CREATE INDEX records_source_run ON records(project_id,connection_id,source_run_id) WHERE kind='saved';
CREATE TABLE record_operations (
 operation_id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 user_id text NOT NULL REFERENCES users(id),
 connection_id text NOT NULL,
 target_id text NOT NULL,
 frozen_digest text NOT NULL,
 responsible_endpoint text NOT NULL,
 receipt jsonb NOT NULL
);
CREATE TABLE record_redaction_policies (
 project_id text PRIMARY KEY REFERENCES projects(id),
 version bigint NOT NULL CHECK(version > 0),
 pointers jsonb NOT NULL
);
CREATE TABLE record_revision_audits (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 record_id text NOT NULL,
 actor_id text NOT NULL REFERENCES users(id),
 occurred_at timestamptz NOT NULL,
 version bigint NOT NULL,
 reason text NOT NULL,
 pointers jsonb NOT NULL
);
