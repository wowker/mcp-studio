import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { HistoryClearService } from "./history-clear-service.js";
import type { StorageReclaimService } from "../projects/storage-reclaim-service.js";

export function createHistoryClearRoutes(history: HistoryClearService, storage: StorageReclaimService) {
  const routes = new Hono();
  const base = "/:projectId/history-clear";
  routes.use(`${base}/*`, bodyLimit({ maxSize: 16 * 1024 }));
  const exposed = new Set(["PROJECT_BUSY", "PROJECT_MAINTENANCE", "PREVIEW_STALE", "PREVIEW_NOT_FOUND", "JOB_NOT_FOUND", "UNIT_NOT_FOUND", "VERSION_NOT_FOUND",
    "UNIT_CONFIRMATION_REQUIRED", "RESOURCE_CONFIRMATION_REQUIRED", "IDEMPOTENCY_CONFLICT", "CLEAR_SCOPE_TOO_LARGE"]);
  routes.onError((error, c) => {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: "INVALID_ARGUMENTS" }, 400);
    const code = exposed.has(error.message) ? error.message : "HISTORY_CLEAR_FAILED";
    return c.json({ error: code }, code === "HISTORY_CLEAR_FAILED" ? 500 : 409);
  });
  routes.post(`${base}/preview`, async (c) => c.json({ data: history.preview(z.uuid().parse(c.req.param("projectId")), await c.req.json()) }));
  routes.post(`${base}/commit`, async (c) => c.json({ data: history.commit(z.uuid().parse(c.req.param("projectId")), await c.req.json()) }));
  routes.get(`${base}/:jobId`, (c) => c.json({ data: storage.getJob(z.uuid().parse(c.req.param("projectId")), z.uuid().parse(c.req.param("jobId"))) }));
  routes.post(`${base}/:jobId/reclaim`, (c) => c.json({ data: storage.reclaim(z.uuid().parse(c.req.param("projectId")), z.uuid().parse(c.req.param("jobId"))) }, 202));
  return routes;
}
