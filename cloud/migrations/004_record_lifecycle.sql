-- Logical storage accounting is calculated from persisted UTF-8 JSON rows,
-- including identities and metadata, with a fixed 128-byte per-row overhead.
ALTER TABLE records ADD COLUMN archived_at timestamptz;
CREATE INDEX records_archived_expiry ON records(archived_at) WHERE archived_at IS NOT NULL;
CREATE TABLE record_retention_policies (
 project_id text PRIMARY KEY REFERENCES projects(id),
 history_retention_days integer NOT NULL CHECK(history_retention_days>0),
 version bigint NOT NULL CHECK(version>0)
);
-- Identity-only deletion markers prevent reuse/source-proof resurrection.
CREATE TABLE record_tombstones (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id),
 owner_id text NOT NULL REFERENCES users(id),
 connection_id text NOT NULL,
 run_id text NOT NULL,
 kind text NOT NULL,
 deleted_at timestamptz NOT NULL
);
