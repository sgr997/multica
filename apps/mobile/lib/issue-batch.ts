import type {
  Agent,
  Issue,
  IssueAssigneeType,
  MemberRole,
} from "@multica/core/types";
import { canDeleteIssue } from "@multica/core/issues/deletion-permissions";

/** Selected ids that still belong to the list the user is looking at. */
export function retainVisibleSelection(
  selectedIds: readonly string[],
  visibleIds: readonly string[],
): string[] {
  const visible = new Set(visibleIds);
  return selectedIds.filter((id) => visible.has(id));
}

export function toggleSelection(
  selectedIds: readonly string[],
  id: string,
): string[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((selected) => selected !== id)
    : [...selectedIds, id];
}

/** The selection after "select all" over the current loaded + filtered rows. */
export function selectAllVisible(visibleIds: readonly string[]): string[] {
  return [...new Set(visibleIds)];
}

/**
 * Batch writes report only how many issues they changed. Anything below the
 * request size means the server refused some items, so the UI must not claim
 * complete success.
 */
export function batchWriteOutcome(
  updated: number,
  requested: number,
): "success" | "partial" {
  return updated < requested ? "partial" : "success";
}

/**
 * Assigning an agent/squad runs work for every selected issue outside the
 * Backlog parking lot. Missing cached rows are treated conservatively because
 * the server, not the client, decides whether a run actually starts.
 */
export function agentAssignmentNeedsRunConfirm(
  assigneeType: IssueAssigneeType | null,
  issues: readonly Pick<Issue, "status">[],
  requestedCount: number,
): boolean {
  if (assigneeType !== "agent" && assigneeType !== "squad") return false;
  if (issues.some((issue) => issue.status !== "backlog")) return true;
  return issues.length < requestedCount;
}

export function canDeleteIssueSelection(
  issues: readonly Pick<Issue, "creator_type" | "creator_id">[],
  userId: string | null,
  role: MemberRole | null,
  agents: readonly Pick<Agent, "id" | "owner_id">[],
  requestedCount: number,
): boolean {
  if (issues.length < requestedCount) return false;
  return issues.every((issue) => canDeleteIssue(issue, userId, role, agents));
}

