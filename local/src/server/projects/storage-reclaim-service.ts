import { fork } from "node:child_process";
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProjectService } from "./project-service.js";
import type { HistoryClearService } from "../runs/history-clear-service.js";
import { historyClearJobSchema, type HistoryClearJob } from "../../shared/run-history-clear.js";

export function createStorageReclaimService({ projects, history, isBusy = () => false }: {
  projects: ProjectService; history: HistoryClearService; isBusy?: () => boolean;
}) {
  const active = new Map<string, HistoryClearJob>(), operations = new Set<Promise<void>>();
  let closed = false;
  const persist = (job: HistoryClearJob) => projects.open(job.projectId).database.prepare(
    "UPDATE history_clear_jobs SET payload_json = ? WHERE project_id = ? AND id = ?").run(JSON.stringify(historyClearJobSchema.parse(job)), job.projectId, job.id);
  const getJob = (projectId: string, jobId: string) => {
    const current = active.get(projectId);
    return current?.id === jobId ? { ...current } : history.getJob(projectId, jobId);
  };
  return {
    getJob,
    reclaim(projectId: string, jobId: string) {
      if (closed) throw new Error("SERVICE_CLOSED");
      const current = active.get(projectId);
      if (current) { if (current.id === jobId) return { ...current }; throw new Error("PROJECT_BUSY"); }
      const job = history.getJob(projectId, jobId);
      if (job.status === "COMPLETE") return job;
      const store = projects.open(projectId), db = store.database;
      db.transaction(() => {
      if ((db.prepare("SELECT active FROM project_maintenance WHERE singleton = 1").get() as { active: number }).active === 1) throw new Error("PROJECT_MAINTENANCE");
      if (isBusy()) throw new Error("PROJECT_BUSY");
      for (const [table, predicate] of [
        ["runs", "status IN ('queued', 'connecting', 'authorizing', 'running')"],
        ["workflow_executions", "status IN ('queued', 'before', 'main', 'after')"],
        ["test_executions", "status IN ('QUEUED', 'RUNNING')"],
        ["test_suite_executions", "status IN ('QUEUED', 'RUNNING')"],
        ["pressure_test_executions", "status IN ('QUEUED', 'RUNNING')"],
        ["ai_test_rounds", "json_extract(payload_json, '$.state') NOT IN ('COMPLETED', 'CANCELLED')"],
        ["ai_test_calls", "outcome IN ('PENDING', 'RUNNING') OR (outcome = 'UNKNOWN' AND may_have_side_effects = 1)"],
        ["authoring_tool_calls", "status IN ('PENDING', 'RUNNING', 'UNKNOWN')"],
      ]) if (db.prepare(`SELECT 1 FROM ${table} WHERE ${predicate} LIMIT 1`).get()) throw new Error("PROJECT_BUSY");
      job.status = "RECLAIM_PENDING"; job.errorCode = null; persist(job);
      const size = (path: string) => { try { return statSync(path).size; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0; throw error; } };
      job.beforeBytes = size(db.name) + size(`${db.name}-wal`);
      job.status = "RECLAIMING"; persist(job);
      db.prepare("UPDATE project_maintenance SET active = 1, owner_pid = ? WHERE singleton = 1").run(process.pid);
      }).immediate();
      const gate = store.beginMaintenance(); active.set(projectId, job);
      const source = import.meta.url.endsWith(".ts");
      const workerUrl = source ? new URL("./storage-reclaim-worker.ts", import.meta.url) : new URL("./projects/storage-reclaim-worker.js", import.meta.url);
      let operation: Promise<void>;
      operation = new Promise<{ ok: boolean; afterBytes?: number }>((resolve) => {
        const child = fork(fileURLToPath(workerUrl), [], { execArgv: source ? ["--import", "tsx"] : [], stdio: ["ignore", "ignore", "ignore", "ipc"] });
        const timeout = setTimeout(() => child.kill(), 120_000);
        timeout.unref();
        let result: { ok: boolean; afterBytes?: number } = { ok: false };
        child.on("message", (message: unknown) => {
          if (message && typeof message === "object" && "ok" in message && message.ok === true && "afterBytes" in message &&
            typeof message.afterBytes === "number" && Number.isSafeInteger(message.afterBytes) && message.afterBytes >= 0) result = { ok: true, afterBytes: message.afterBytes };
        });
        child.on("error", () => { clearTimeout(timeout); resolve({ ok: false }); });
        child.on("exit", (code) => { clearTimeout(timeout); resolve(code === 0 ? result : { ok: false }); });
        child.send({ databasePath: gate.databasePath }, (error) => { if (error) { child.kill(); resolve({ ok: false }); } });
      }).then((result) => {
        gate.release();
        job.status = result.ok ? "COMPLETE" : "RECLAIM_FAILED";
        job.afterBytes = result.ok ? result.afterBytes! : null;
        job.reclaimedBytes = result.ok ? Math.max(0, job.beforeBytes! - result.afterBytes!) : null;
        job.errorCode = result.ok ? null : "STORAGE_RECLAIM_FAILED";
        persist(job);
      }).catch(() => {
        job.status = "RECLAIM_FAILED"; job.errorCode = "STORAGE_RECLAIM_FAILED";
        try { gate.release(); persist(job); } catch { /* The durable RECLAIMING state is recovered on next startup. */ }
      }).finally(() => { active.delete(projectId); operations.delete(operation); });
      operations.add(operation);
      return { ...job };
    },
    resumeJobs() {
      for (const project of projects.list()) {
        const db = projects.open(project.id).database;
        const gate = db.prepare("SELECT active, owner_pid FROM project_maintenance WHERE singleton = 1").get() as { active: number; owner_pid: number | null };
        if (gate.active && gate.owner_pid && gate.owner_pid !== process.pid) {
          try { process.kill(gate.owner_pid, 0); continue; }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") continue; }
        }
        db.prepare("UPDATE project_maintenance SET active = 0, owner_pid = NULL WHERE singleton = 1").run();
        const rows = db.prepare("SELECT payload_json FROM history_clear_jobs WHERE json_extract(payload_json, '$.status') IN ('RECLAIMING', 'RECLAIM_PENDING')").all() as Array<{ payload_json: string }>;
        for (const row of rows) persist({ ...historyClearJobSchema.parse(JSON.parse(row.payload_json)), status: "RECLAIM_FAILED", errorCode: "RECLAIM_INTERRUPTED" });
      }
    },
    async close() { closed = true; await Promise.all([...operations]); },
  };
}
export type StorageReclaimService = ReturnType<typeof createStorageReclaimService>;
