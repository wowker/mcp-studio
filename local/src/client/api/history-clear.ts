import { z } from "zod";
import { historyClearCommitSchema, historyClearJobSchema, historyClearPreviewSchema, historyClearScopeSchema,
  type HistoryClearScope } from "../../shared/run-history-clear.js";

async function request<T extends z.ZodType>(projectId: string, path: string, schema: T, body?: unknown, signal?: AbortSignal): Promise<z.output<T>> {
  z.uuid().parse(projectId);
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/history-clear/${path}`, { signal,
    method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const json = await response.json();
  if (!response.ok) {
    const code = z.object({ error: z.string() }).safeParse(json);
    throw new Error(code.success ? code.data.error : "HISTORY_CLEAR_FAILED");
  }
  const result = schema.parse(z.object({ data: z.unknown() }).strict().parse(json).data);
  if ((result as { projectId?: string }).projectId !== projectId) throw new Error("HISTORY_CLEAR_IDENTITY_MISMATCH");
  return result;
}
export const historyClearClient = {
  preview: (projectId: string, scope: HistoryClearScope, signal?: AbortSignal) => request(projectId, "preview", historyClearPreviewSchema, historyClearScopeSchema.parse(scope), signal),
  commit: (projectId: string, input: z.input<typeof historyClearCommitSchema>) => request(projectId, "commit", historyClearJobSchema, historyClearCommitSchema.parse(input)),
  getJob: (projectId: string, jobId: string, signal?: AbortSignal) => request(projectId, z.uuid().parse(jobId), historyClearJobSchema, undefined, signal),
  reclaim: (projectId: string, jobId: string) => request(projectId, `${z.uuid().parse(jobId)}/reclaim`, historyClearJobSchema, {}),
};
