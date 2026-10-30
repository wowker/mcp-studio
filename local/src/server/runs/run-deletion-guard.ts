import type Database from "better-sqlite3";
export function runRetentionReason(db: Database.Database, runId: string): "WORKFLOW" | "TEST_EXECUTION" | "VALIDATION" | null {
  for (const [table, reason] of [["workflow_execution_runs", "WORKFLOW"], ["test_execution_steps", "TEST_EXECUTION"], ["validation_expectation_evidence", "VALIDATION"]] as const) {
    if (db.prepare(`SELECT 1 FROM ${table} WHERE run_id = ? LIMIT 1`).get(runId)) return reason;
  }
  return null;
}
export function runHasActiveAiOwner(db: Database.Database, runId: string): boolean {
  return Boolean(db.prepare(`SELECT 1 FROM ai_test_calls c JOIN ai_test_rounds r ON r.id = c.round_id
    WHERE c.run_id = ? AND (json_extract(r.payload_json, '$.state') NOT IN ('COMPLETED', 'CANCELLED')
      OR c.outcome IN ('PENDING', 'RUNNING') OR (c.outcome = 'UNKNOWN' AND c.may_have_side_effects = 1)) LIMIT 1`).get(runId));
}
