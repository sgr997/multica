import type { MemberRole } from "@multica/core/types";

/**
 * Mirrors the server's issue-update gate. `UpdateIssue` loads the issue
 * through `loadIssueForUser` and applies no further role check, so every
 * workspace member may edit an issue. The detail screen's edit affordances
 * use the same gate; actions that write issue fields should hide for a
 * viewer without workspace membership.
 */
export function canEditIssue(
  userId: string | null,
  role: MemberRole | null,
): boolean {
  return userId !== null && role !== null;
}
