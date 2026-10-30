import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { historyClearCommitSchema, historyClearJobSchema, historyClearPreviewSchema, historyClearScopeSchema,
  type HistoryClearScope, type HistoryClearPreview } from "../../shared/run-history-clear.js";
import type { ProjectService } from "../projects/project-service.js";
import { RunRepository } from "./run-repository.js";
import { RunEventBus } from "./run-event-bus.js";
import { runHasActiveAiOwner, runRetentionReason } from "./run-deletion-guard.js";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Row = Record<string, unknown> & { id: string };
type Snapshot = { units: Row[]; versions: Row[]; rounds: Row[]; calls: Row[]; resources: Row[]; results: Row[]; conclusions: Row[]; runs: Row[] };
const ids = (rows: Row[]) => JSON.stringify(rows.map((row) => row.id));
function bounded(rows: Row[]) { if (rows.length > 10000) throw new Error("CLEAR_SCOPE_TOO_LARGE"); return rows; }
function byIds(db: Database.Database, table: string, column: string, values: string): Row[] {
  return bounded(db.prepare(`SELECT * FROM ${table} WHERE ${column} IN (SELECT value FROM json_each(?)) ORDER BY id LIMIT 10001`).all(values) as Row[]);
}
function snapshot(db: Database.Database, projectId: string, scope: HistoryClearScope, runIds?: string[]): Snapshot {
  const data: Snapshot = { units: [], versions: [], rounds: [], calls: [], resources: [], results: [], conclusions: [], runs: [] };
  if (scope.kind !== "RUN_HISTORY") {
    const unit = db.prepare("SELECT * FROM ai_test_units WHERE project_id = ? AND id = ?").get(projectId, scope.unitId) as Row | undefined;
    if (!unit) throw new Error("UNIT_NOT_FOUND");
    data.units = [unit];
    data.versions = bounded(db.prepare(`SELECT * FROM ai_test_unit_versions WHERE project_id = ? AND unit_id = ?
      ${"versionId" in scope && scope.versionId ? "AND id = ?" : ""} ORDER BY id LIMIT 10001`)
      .all(projectId, scope.unitId, ...("versionId" in scope && scope.versionId ? [scope.versionId] : [])) as Row[]);
    if (!data.versions.length) throw new Error("VERSION_NOT_FOUND");
    data.rounds = byIds(db, "ai_test_rounds", "version_id", ids(data.versions));
    data.calls = byIds(db, "ai_test_calls", "round_id", ids(data.rounds));
    data.runs = byIds(db, "runs", "id", JSON.stringify(data.calls.map((call) => call.run_id).filter(Boolean)));
  } else {
    data.runs = byIds(db, "runs", "id", JSON.stringify(runIds ?? []));
    data.calls = byIds(db, "ai_test_calls", "run_id", ids(data.runs));
    data.rounds = byIds(db, "ai_test_rounds", "id", JSON.stringify(data.calls.map((call) => call.round_id)));
  }
  data.resources = byIds(db, "ai_test_resources", "round_id", ids(data.rounds));
  data.results = byIds(db, "ai_test_case_result_revisions", "round_id", ids(data.rounds));
  data.conclusions = byIds(db, "ai_test_conclusion_revisions", "round_id", ids(data.rounds));
  for (const round of data.rounds) if (!["COMPLETED", "CANCELLED"].includes(JSON.parse(String(round.payload_json)).state)) throw new Error("PROJECT_BUSY");
  for (const call of data.calls) if (["PENDING", "RUNNING"].includes(String(call.outcome)) || (call.outcome === "UNKNOWN" && call.may_have_side_effects === 1)) throw new Error("PROJECT_BUSY");
  for (const run of data.runs) if (["queued", "connecting", "authorizing", "running"].includes(String(run.status)) || runHasActiveAiOwner(db, run.id)) throw new Error("PROJECT_BUSY");
  return data;
}
function retainedRuns(db: Database.Database, scope: HistoryClearScope, rows: Row[]): HistoryClearPreview["retained"] {
  return rows.flatMap((run) => {
    const reason = runRetentionReason(db, run.id) ?? (run.pinned === 1 && (scope.kind !== "RUN_HISTORY" || !scope.includePinned) ? "PINNED" : null);
    return reason ? [{ runId: run.id, reason }] : [];
  });
}
export function createHistoryClearService({ projects }: { projects: ProjectService }) {
  return {
    preview(projectId: string, value: unknown) {
      const scope = historyClearScopeSchema.parse(value), store = projects.open(projectId), db = store.database;
      return db.transaction(() => {
        if ((db.prepare("SELECT active FROM project_maintenance WHERE singleton = 1").get() as { active: number }).active) throw new Error("PROJECT_MAINTENANCE");
        let runIds: string[] = [];
        if (scope.kind === "RUN_HISTORY") {
          const repo = new RunRepository(store, new RunEventBus());
          let cursor: string | undefined;
          do { const page = repo.list(projectId, cursor, { ...scope.filter, limit: 100 });
            runIds.push(...page.runs.map((run) => run.id)); cursor = page.nextCursor ?? undefined;
            if (runIds.length > 10000) throw new Error("CLEAR_SCOPE_TOO_LARGE");
          } while (cursor);
        }
        const data = snapshot(db, projectId, scope, runIds), retained = retainedRuns(db, scope, data.runs);
        const excluded = new Set(retained.map((item) => item.runId));
        const deletesUnit = scope.kind === "UNIT" || (scope.kind === "VERSION" &&
          (db.prepare("SELECT count(*) AS n FROM ai_test_unit_versions WHERE unit_id = ?").get(scope.unitId) as { n: number }).n === 1);
        const retainedResourceIds = data.resources.filter((resource) => !["CLEANED", "NOT_REQUIRED"].includes(JSON.parse(String(resource.payload_json)).status)).map((row) => row.id);
        const runPayloads = data.runs.filter((run) => !excluded.has(run.id)).reduce((total, run) => total +
          (db.prepare(`SELECT (SELECT coalesce(sum(length(CAST(arguments_json AS BLOB)) + length(CAST(jsonrpc_json AS BLOB)) + coalesce(length(CAST(http_json AS BLOB)), 0)), 0) FROM run_requests WHERE run_id = ?) +
            (SELECT coalesce(sum(coalesce(length(CAST(result_json AS BLOB)), 0) + coalesce(length(CAST(error_json AS BLOB)), 0)), 0) FROM run_responses WHERE run_id = ?) +
            (SELECT coalesce(sum(length(CAST(payload_json AS BLOB))), 0) FROM run_events WHERE run_id = ?) AS n`).get(run.id, run.id, run.id) as { n: number }).n, 0);
        const preview = historyClearPreviewSchema.parse({ id: randomUUID(), projectId, scope, digest: hash({ data, retained }), createdAt: new Date().toISOString(),
          counts: { units: Number(deletesUnit), versions: scope.kind === "UNIT" || scope.kind === "VERSION" ? data.versions.length : 0,
            rounds: scope.kind === "RUN_HISTORY" ? 0 : data.rounds.length, runs: data.runs.length - retained.length },
          retained, retainedResourceIds, retainedResources: data.resources.filter((row) => retainedResourceIds.includes(row.id)).map((row) => {
            const resource = JSON.parse(String(row.payload_json)); return { id: row.id, resourceId: resource.resourceId, status: resource.status };
          }), deletesUnit, estimatedPayloadBytes: runPayloads + (scope.kind === "RUN_HISTORY" ? 0 :
            [...data.rounds, ...data.calls, ...data.resources, ...data.results, ...data.conclusions,
              ...(scope.kind === "TEST_HISTORY" ? [] : data.versions)].reduce((n, row) => n + Buffer.byteLength(String(row.payload_json ?? "")), 0)) });
        db.prepare("INSERT INTO history_clear_previews VALUES (?, ?, ?, ?, ?)").run(preview.id, projectId, JSON.stringify(preview), JSON.stringify({ runIds: data.runs.map((run) => run.id) }), preview.createdAt);
        return preview;
      }).immediate();
    },
    commit(projectId: string, value: unknown) {
      const input = historyClearCommitSchema.parse(value), db = projects.open(projectId).database;
      return db.transaction(() => {
        if ((db.prepare("SELECT active FROM project_maintenance WHERE singleton = 1").get() as { active: number }).active) throw new Error("PROJECT_MAINTENANCE");
        const prior = db.prepare("SELECT * FROM history_clear_jobs WHERE project_id = ? AND (idempotency_key = ? OR preview_id = ?)")
          .get(projectId, input.idempotencyKey, input.previewId) as { request_digest: string; payload_json: string } | undefined;
        if (prior) { if (prior.request_digest !== hash(input)) throw new Error("IDEMPOTENCY_CONFLICT"); return historyClearJobSchema.parse(JSON.parse(prior.payload_json)); }
        const row = db.prepare("SELECT * FROM history_clear_previews WHERE project_id = ? AND id = ?").get(projectId, input.previewId) as { payload_json: string; snapshot_json: string } | undefined;
        if (!row) throw new Error("PREVIEW_NOT_FOUND");
        const preview = historyClearPreviewSchema.parse(JSON.parse(row.payload_json));
        if (preview.digest !== input.digest) throw new Error("PREVIEW_STALE");
        if (preview.deletesUnit && !input.acknowledgeUnitDeletion) throw new Error("UNIT_CONFIRMATION_REQUIRED");
        if (preview.retainedResourceIds.length && !input.acknowledgeResources) throw new Error("RESOURCE_CONFIRMATION_REQUIRED");
        const frozen = JSON.parse(row.snapshot_json) as { runIds: string[] };
        const current = snapshot(db, projectId, preview.scope, frozen.runIds);
        const retained = retainedRuns(db, preview.scope, current.runs);
        if (hash({ data: current, retained }) !== input.digest) throw new Error("PREVIEW_STALE");
        const excluded = new Set(retained.map((item) => item.runId));
        const repo = new RunRepository(projects.open(projectId), new RunEventBus());
        for (const run of current.runs) if (!excluded.has(run.id) && repo.delete(projectId, run.id) !== "deleted") throw new Error("PREVIEW_STALE");
        const scope = preview.scope;
        if (scope.kind !== "RUN_HISTORY") {
          db.prepare("DELETE FROM ai_test_rounds WHERE id IN (SELECT value FROM json_each(?))").run(ids(current.rounds));
          if (scope.kind !== "TEST_HISTORY") {
            db.prepare("DELETE FROM ai_test_unit_versions WHERE id IN (SELECT value FROM json_each(?))").run(ids(current.versions));
            if (preview.deletesUnit) db.prepare("DELETE FROM ai_test_units WHERE project_id = ? AND id = ?").run(projectId, scope.unitId);
          }
        }
        const job = historyClearJobSchema.parse({ id: randomUUID(), projectId, previewId: preview.id, status: "LOGICALLY_CLEARED", beforeBytes: null, afterBytes: null,
          reclaimedBytes: null, errorCode: null, createdAt: new Date().toISOString() });
        db.prepare("INSERT INTO history_clear_jobs VALUES (?, ?, ?, ?, ?, ?)").run(job.id, projectId, preview.id, input.idempotencyKey, hash(input), JSON.stringify(job));
        // The frozen snapshot is no longer needed; do not keep deleted prose in the deletion journal.
        db.prepare("UPDATE history_clear_previews SET snapshot_json = '{}' WHERE id = ?").run(preview.id);
        return job;
      }).immediate();
    },
    getJob(projectId: string, jobId: string) {
      const row = projects.open(projectId).database.prepare("SELECT payload_json FROM history_clear_jobs WHERE project_id = ? AND id = ?").get(projectId, jobId) as { payload_json: string } | undefined;
      if (!row) throw new Error("JOB_NOT_FOUND");
      return historyClearJobSchema.parse(JSON.parse(row.payload_json));
    },
  };
}
export type HistoryClearService = ReturnType<typeof createHistoryClearService>;
