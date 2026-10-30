import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHistoryClearService } from "../../runs/history-clear-service.js";
import { createProjectService, type ProjectService } from "../project-service.js";
import { createStorageReclaimService } from "../storage-reclaim-service.js";
import Database from "better-sqlite3";

let projects: ProjectService | undefined;
let dataRoot: string | undefined;
afterEach(() => { projects?.close(); projects = undefined;
  if (dataRoot !== undefined) rmSync(dataRoot, { recursive: true, force: true }); dataRoot = undefined; });
function setup(): { projects: ProjectService; projectId: string } {
  dataRoot = mkdtempSync(join(tmpdir(), "mcp-inspector-reclaim-"));
  projects = createProjectService({ dataRoot });
  return { projects, projectId: projects.create("Reclaim").id };
}
it("reclaims real disk pages in a worker and resumes the same ProjectStore", async () => {
  const fixture = setup(), store = fixture.projects.open(fixture.projectId), db = store.database;
  db.exec("CREATE TABLE reclaim_fixture (value TEXT)");
  db.prepare("INSERT INTO reclaim_fixture VALUES (?)").run("x".repeat(8 * 1024 * 1024));
  db.exec("DELETE FROM reclaim_fixture");
  db.pragma("wal_checkpoint(TRUNCATE)");
  const clear = createHistoryClearService({ projects: fixture.projects });
  const preview = clear.preview(fixture.projectId, { kind: "RUN_HISTORY", filter: {} });
  const job = clear.commit(fixture.projectId, { previewId: preview.id, digest: preview.digest, idempotencyKey: "clear" });
  const databasePath = db.name;
  const reclaim = createStorageReclaimService({ projects: fixture.projects, history: clear });
  expect(reclaim.reclaim(fixture.projectId, job.id).status).toBe("RECLAIMING");
  expect(() => store.database).toThrow("PROJECT_MAINTENANCE");
  expect(reclaim.getJob(fixture.projectId, job.id).status).toBe("RECLAIMING");
  const otherConnection = new Database(databasePath);
  try {
    expect(() => otherConnection.prepare("INSERT INTO runs (id) VALUES ('blocked')").run()).toThrow("PROJECT_MAINTENANCE");
  } finally { otherConnection.close(); }
  await reclaim.close();
  const completed = clear.getJob(fixture.projectId, job.id);
  expect(completed.status).toBe("COMPLETE");
  expect(completed.reclaimedBytes).toBeGreaterThan(4 * 1024 * 1024);
  expect(store.database.pragma("foreign_key_check")).toEqual([]);
});
it("blocks maintenance while a caller reports busy and recovers an interrupted durable job without repeating deletion", async () => {
  const fixture = setup();
  const history = createHistoryClearService({ projects: fixture.projects });
  const preview = history.preview(fixture.projectId, { kind: "RUN_HISTORY", filter: {} });
  const job = history.commit(fixture.projectId, { previewId: preview.id, digest: preview.digest, idempotencyKey: "clear" });
  const storage = createStorageReclaimService({ projects: fixture.projects, history, isBusy: () => true });
  expect(() => storage.reclaim(fixture.projectId, job.id)).toThrow("PROJECT_BUSY");
  expect(history.getJob(fixture.projectId, job.id).status).toBe("LOGICALLY_CLEARED");
  const db = fixture.projects.open(fixture.projectId).database;
  db.prepare("UPDATE history_clear_jobs SET payload_json = json_set(payload_json, '$.status', 'RECLAIMING') WHERE id = ?").run(job.id);
  db.prepare("UPDATE project_maintenance SET active = 1 WHERE singleton = 1").run();
  storage.resumeJobs();
  expect(history.getJob(fixture.projectId, job.id)).toMatchObject({ status: "RECLAIM_FAILED", errorCode: "RECLAIM_INTERRUPTED", reclaimedBytes: null });
  expect(db.prepare("SELECT active FROM project_maintenance").get()).toEqual({ active: 0 });
  await storage.close();
});
