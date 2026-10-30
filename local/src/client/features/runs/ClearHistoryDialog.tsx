import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../../components/overlays/Dialog.js";
import { Button } from "../../components/actions/Button.js";
import { historyClearClient } from "../../api/history-clear.js";
import type { HistoryClearJob, HistoryClearScope } from "../../../shared/run-history-clear.js";

interface PreviewState<T> { data: T | null; loading: boolean; error: string | null }

function usePreviewQuery<T>(key: string, load: (signal: AbortSignal) => Promise<T>): PreviewState<T> {
  const [state, setState] = useState<PreviewState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ data, loading: false, error: null }); },
      (cause: unknown) => {
        if (!controller.signal.aborted) {
          setState({ data: null, loading: false, error: cause instanceof Error ? cause.message : "HISTORY_CLEAR_FAILED" });
        }
      },
    );
    return () => controller.abort();
  }, [key, load]);
  return state;
}

export function ClearHistoryDialog({ projectId, scope, onClose, onChanged, api = historyClearClient }: {
  projectId: string; scope: HistoryClearScope; onClose(): void; onChanged(): void; api?: typeof historyClearClient;
}) {
  const { t, i18n } = useTranslation("historyClear"), id = useId(), cancel = useRef<HTMLButtonElement>(null);
  const [includePinned, setIncludePinned] = useState(scope.kind === "RUN_HISTORY" && scope.includePinned);
  const [revision, setRevision] = useState(0), [ack, setAck] = useState(false), [unitAck, setUnitAck] = useState(false), [resourcesAck, setResourcesAck] = useState(false);
  const [job, setJob] = useState<HistoryClearJob | null>(null), [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
  const alive = useRef(true), operationKey = useRef(crypto.randomUUID());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const scopeKey = JSON.stringify(scope);
  const load = useCallback((signal: AbortSignal) => api.preview(projectId, scope.kind === "RUN_HISTORY" ? { ...scope, includePinned } : scope, signal), [api, projectId, scopeKey, includePinned]);
  const query = usePreviewQuery(`${projectId}:${scopeKey}:${includePinned}:${revision}`, load);
  const preview = query.data;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!job) return;
    try { const result = await api.getJob(projectId, job.id, signal); if (alive.current && !signal?.aborted) { setJob(result); setError(null); } }
    catch { if (alive.current && !signal?.aborted) setError("HISTORY_CLEAR_FAILED"); }
  }, [api, projectId, job?.id]);
  useEffect(() => {
    if (!job || !["RECLAIM_PENDING", "RECLAIMING"].includes(job.status)) return;
    const controller = new AbortController();
    const timer = setInterval(() => { void refresh(controller.signal); }, 1000);
    return () => { clearInterval(timer); controller.abort(); };
  }, [job?.status, refresh]);
  async function action(kind: "commit" | "reclaim") {
    setPending(true); setError(null);
    try {
      const result = kind === "commit" ? await api.commit(projectId, { previewId: preview!.id, digest: preview!.digest,
        idempotencyKey: operationKey.current, acknowledgeResources: resourcesAck, acknowledgeUnitDeletion: unitAck }) : await api.reclaim(projectId, job!.id);
      if (!alive.current) return;
      setJob(result); if (kind === "commit") onChanged();
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "HISTORY_CLEAR_FAILED"); }
    finally { if (alive.current) setPending(false); }
  }
  const message = error === "PROJECT_BUSY" || error === "PROJECT_MAINTENANCE" ? t("busy") : error === "PREVIEW_STALE" ? t("stale") : t("error");
  const number = (n: number) => n.toLocaleString(i18n.language);
  return <Dialog titleId={id} onClose={onClose} closeDisabled={pending} initialFocusRef={cancel}>
    <h2 id={id}>{t("title")}</h2><p>{t("warning")}</p><p>{t("target")}: <code>{scope.kind === "RUN_HISTORY" ? JSON.stringify(scope.filter) : scope.unitId}{"versionId" in scope && scope.versionId ? ` / ${scope.versionId}` : ""}</code></p>
    {!job && <>{scope.kind === "RUN_HISTORY" && <label><input type="checkbox" checked={includePinned} disabled={pending} onChange={(e) => { setIncludePinned(e.target.checked); setAck(false); }} />{t("includePinned")}</label>}
      {query.loading && <p role="status">{t("loading")}</p>}{query.error && <p role="alert">{t(query.error === "PROJECT_BUSY" || query.error === "PROJECT_MAINTENANCE" ? "busy" : "error")}</p>}
      {preview && <><p>{t("counts", preview.counts)}</p><p>{t("estimate", { bytes: number(preview.estimatedPayloadBytes) })}</p><p>{t("retained", { count: preview.retained.length })}</p>
        {preview.retained.length > 0 && <details><summary>{t("retained", { count: preview.retained.length })}</summary><ul>{preview.retained.map((item) => <li key={item.runId}><code>{item.runId}</code> · {t(`reason.${item.reason}`)}</li>)}</ul></details>}
        <label><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />{t("acknowledge")}</label>
        {preview.deletesUnit && <label><input type="checkbox" checked={unitAck} onChange={(e) => setUnitAck(e.target.checked)} />{t("acknowledgeUnit")}</label>}
        {preview.retainedResourceIds.length > 0 && <><p>{t("resources")}</p><ul>{preview.retainedResources.map((resource) => <li key={resource.id}><code>{resource.resourceId}</code> · {resource.status} · <code>{resource.id}</code></li>)}</ul><label><input type="checkbox" checked={resourcesAck} onChange={(e) => setResourcesAck(e.target.checked)} />{t("acknowledgeResources")}</label></>}
      </>}</>}
    {job && <><p role="status">{t(`status.${job.status}`)}</p>{job.status === "COMPLETE" && <p>{t("measured", { before: number(job.beforeBytes!), after: number(job.afterBytes!), reclaimed: number(job.reclaimedBytes!) })}</p>}</>}
    {error && <p role="alert">{message}</p>}
    <div className="dialog-actions"><button type="button" className="ui-button" data-variant="secondary" ref={cancel} disabled={pending} onClick={onClose}>{t(job ? "close" : "cancel")}</button>
      {!job && <><Button disabled={pending} onClick={() => { operationKey.current = crypto.randomUUID(); setRevision((n) => n + 1); setAck(false); setUnitAck(false); setResourcesAck(false); setError(null); }}>{t("retry")}</Button>
        <Button variant="danger" disabled={pending || !preview || !ack || (preview.deletesUnit && !unitAck) || (preview.retainedResourceIds.length > 0 && !resourcesAck)} onClick={() => void action("commit")}>{t("confirm")}</Button></>}
      {job && ["LOGICALLY_CLEARED", "RECLAIM_FAILED"].includes(job.status) && <Button disabled={pending} onClick={() => void action("reclaim")}>{t("reclaim")}</Button>}
      {job && error && <Button onClick={() => void refresh()}>{t("refresh")}</Button>}
    </div>
  </Dialog>;
}
