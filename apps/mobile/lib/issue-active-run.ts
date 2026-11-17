import type { AgentTask } from "@multica/core/types";

/**
 * Whether an issue has an agent run that has not finished yet.
 *
 * `/api/issues/:id/active-task` already returns only non-terminal tasks
 * (queued / dispatched / waiting_local_directory / running), so any row is
 * active. Keep the rule in one place: the issue-header badge and the inbox
 * landing decision must not drift into two different definitions of
 * "running".
 */
export function hasActiveRun(
  tasks: readonly AgentTask[] | undefined | null,
): boolean {
  return !!tasks && tasks.length > 0;
}
