export const historyClear = {
  title: "清空预览与存储回收", warning: "提交后无法通过应用恢复。清空只删除 Inspector 记录，不会删除远端业务资源。",
  loading: "正在计算影响范围…", confirm: "确认清空", cancel: "取消", close: "关闭", retry: "重新预览", reclaim: "整理并回收存储", refresh: "刷新状态",
  unit: "删除测试单元", version: "删除当前版本", testHistory: "清空测试历史", runHistory: "清空运行历史",
  versionHistory: "清空当前版本测试历史",
  target: "目标", includePinned: "包含固定运行记录", acknowledge: "我理解此操作不可恢复", acknowledgeUnit: "确认同时删除整个测试单元（含最后版本）",
  acknowledgeResources: "我确认以下资源的清理信息将失去完整证据，需自行跟进", resources: "尚未清理的资源记录 ID",
  counts: "单元 {{units}} · 版本 {{versions}} · 轮次 {{rounds}} · 调用 {{runs}}", estimate: "预计删除载荷：{{bytes}} 字节（不是实际释放空间）",
  retained: "保留 {{count}} 条被引用或固定的调用", reason: { PINNED: "已固定", WORKFLOW: "工作流引用", TEST_EXECUTION: "旧测试引用", VALIDATION: "验证证据引用" },
  status: { LOGICALLY_CLEARED: "记录已清空，尚未整理存储", RECLAIM_PENDING: "等待存储整理", RECLAIMING: "正在整理存储，项目暂时不可写入", COMPLETE: "存储整理完成", RECLAIM_FAILED: "记录已清空，但存储整理失败；可重试" },
  measured: "实测：{{before}} → {{after}} 字节；释放 {{reclaimed}} 字节", error: "操作失败，请重新预览后重试。",
  busy: "项目仍有活动任务或未解决的写入，请先结束或处理后重试。", stale: "预览范围内的记录已变化，请重新预览。",
};
