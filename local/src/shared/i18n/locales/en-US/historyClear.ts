export const historyClear = {
  title: "Clear preview and storage reclaim", warning: "This cannot be undone in the app. Clearing removes Inspector records, not remote business resources.",
  loading: "Calculating impact…", confirm: "Confirm clear", cancel: "Cancel", close: "Close", retry: "Preview again", reclaim: "Compact and reclaim storage", refresh: "Refresh status",
  unit: "Delete test unit", version: "Delete current version", testHistory: "Clear test history", runHistory: "Clear run history",
  versionHistory: "Clear current version history",
  target: "Target", includePinned: "Include pinned runs", acknowledge: "I understand this cannot be undone", acknowledgeUnit: "Also delete the entire test unit (including its last version)",
  acknowledgeResources: "I acknowledge the loss of complete cleanup evidence for these resources and will follow up", resources: "Uncleaned resource record IDs",
  counts: "Units {{units}} · Versions {{versions}} · Rounds {{rounds}} · Calls {{runs}}", estimate: "Estimated payload deletion: {{bytes}} bytes (not measured reclaimed space)",
  retained: "Keeping {{count}} referenced or pinned calls", reason: { PINNED: "Pinned", WORKFLOW: "Workflow reference", TEST_EXECUTION: "Legacy test reference", VALIDATION: "Validation evidence reference" },
  status: { LOGICALLY_CLEARED: "Records cleared; storage not compacted", RECLAIM_PENDING: "Storage compaction pending", RECLAIMING: "Compacting storage; project writes are temporarily unavailable", COMPLETE: "Storage compaction complete", RECLAIM_FAILED: "Records cleared, but compaction failed; retry is available" },
  measured: "Measured: {{before}} → {{after}} bytes; reclaimed {{reclaimed}} bytes", error: "Operation failed. Preview again before retrying.",
  busy: "The project has active tasks or unresolved writes. Finish or resolve them before retrying.", stale: "Records in the preview changed. Preview again.",
};
