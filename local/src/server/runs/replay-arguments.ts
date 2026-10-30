import type { RunDetail } from "./run-types.js";

export class ReplayArgumentsUnavailableError extends Error {
  readonly code = "REPLAY_BLOCKED" as const;
  constructor() {
    super("Stored AI test arguments are redacted; supply fresh arguments in a new approved test round");
    this.name = "ReplayArgumentsUnavailableError";
  }
}

/** Masked evidence is not executable input. Fail closed even for a literal mask. */
export function assertReplayArgumentsAvailable(source: RunDetail): void {
  if (source.invocationSource === "AI_TOOL_TEST" &&
      /\[(?:REDACTED|TRUNCATED)\]/u.test(JSON.stringify(source.request.arguments))) {
    throw new ReplayArgumentsUnavailableError();
  }
}
