import { z } from "zod";
import { runHistoryFilterSchema } from "./run-replay.js";
const id = z.uuid();
export const historyClearScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("UNIT"), unitId: id }).strict(),
  z.object({ kind: z.literal("VERSION"), unitId: id, versionId: id }).strict(),
  z.object({ kind: z.literal("TEST_HISTORY"), unitId: id, versionId: id.optional() }).strict(),
  z.object({ kind: z.literal("RUN_HISTORY"), filter: runHistoryFilterSchema, includePinned: z.boolean().default(false) }).strict(),
]);
export type HistoryClearScope = z.output<typeof historyClearScopeSchema>;
export const historyClearPreviewSchema = z.object({
  id, projectId: id, scope: historyClearScopeSchema, digest: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.string().datetime(),
  counts: z.object({ units: z.number().int().nonnegative(), versions: z.number().int().nonnegative(), rounds: z.number().int().nonnegative(), runs: z.number().int().nonnegative() }).strict(),
  retained: z.array(z.object({ runId: id, reason: z.enum(["PINNED", "WORKFLOW", "TEST_EXECUTION", "VALIDATION"]) }).strict()).max(10000),
  retainedResourceIds: z.array(id).max(10000), estimatedPayloadBytes: z.number().int().nonnegative(), deletesUnit: z.boolean(),
  retainedResources: z.array(z.object({ id, resourceId: z.string().max(512), status: z.string().max(32) }).strict()).max(10000).default([]),
}).strict();
export const historyClearCommitSchema = z.object({
  previewId: id, digest: z.string().regex(/^[a-f0-9]{64}$/), idempotencyKey: z.string().trim().min(1).max(200),
  acknowledgeResources: z.boolean().default(false), acknowledgeUnitDeletion: z.boolean().default(false),
}).strict();
export const historyClearJobSchema = z.object({
  id, projectId: id, previewId: id,
  status: z.enum(["LOGICALLY_CLEARED", "RECLAIM_PENDING", "RECLAIMING", "COMPLETE", "RECLAIM_FAILED"]),
  beforeBytes: z.number().nonnegative().nullable(), afterBytes: z.number().nonnegative().nullable(), reclaimedBytes: z.number().nonnegative().nullable(),
  errorCode: z.string().nullable(), createdAt: z.string().datetime(),
}).strict();
export type HistoryClearPreview = z.output<typeof historyClearPreviewSchema>;
export type HistoryClearJob = z.output<typeof historyClearJobSchema>;
