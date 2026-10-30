// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ClearHistoryDialog } from "../ClearHistoryDialog.js";
import type { historyClearClient } from "../../../api/history-clear.js";
import "../../../i18n/index.js";

afterEach(cleanup);
it("requires irreversible and last-unit confirmation, and distinguishes logical clear from actual reclaim", async () => {
  const preview = { id: "preview", digest: "digest", counts: { units: 1, versions: 1, rounds: 1, runs: 3 }, retained: [], retainedResourceIds: [], deletesUnit: true, estimatedPayloadBytes: 2048 };
  const api = { preview: vi.fn(async () => preview), commit: vi.fn(async () => ({ id: "job", status: "LOGICALLY_CLEARED" })),
    reclaim: vi.fn(async () => ({ id: "job", status: "COMPLETE", beforeBytes: 4096, afterBytes: 2048, reclaimedBytes: 2048 })), getJob: vi.fn() } as unknown as typeof historyClearClient;
  const onChanged = vi.fn();
  render(<ClearHistoryDialog projectId="p" scope={{ kind: "UNIT", unitId: "u" }} api={api} onClose={vi.fn()} onChanged={onChanged} />);
  expect(await screen.findByText("单元 1 · 版本 1 · 轮次 1 · 调用 3")).toBeVisible();
  const submit = screen.getByRole("button", { name: "确认清空" });
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByLabelText("我理解此操作不可恢复"));
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByLabelText("确认同时删除整个测试单元（含最后版本）"));
  fireEvent.click(submit);
  expect(await screen.findByText("记录已清空，尚未整理存储")).toBeVisible();
  expect(onChanged).toHaveBeenCalledTimes(1);
  expect(api.reclaim).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "整理并回收存储" }));
  expect(await screen.findByText("存储整理完成")).toBeVisible();
  expect(screen.getByText("实测：4,096 → 2,048 字节；释放 2,048 字节")).toBeVisible();
});
it("keeps commit disabled after an invalidated preview and exposes a new preview action", async () => {
  const api = { preview: vi.fn(async () => { throw new Error("PROJECT_BUSY"); }) } as unknown as typeof historyClearClient;
  render(<ClearHistoryDialog projectId="p" scope={{ kind: "RUN_HISTORY", filter: {}, includePinned: false }} api={api} onClose={vi.fn()} onChanged={vi.fn()} />);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "确认清空" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重新预览" }));
  await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(2));
});
