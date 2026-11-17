import type { InboxItem, Issue } from "@multica/core/types";
import { issueStatusCategory } from "@/lib/issue-status";

export function isIssueDoneOrCancelled(
  issue: Pick<Issue, "status" | "status_category">,
): boolean {
  if (issue.status === "done" || issue.status === "cancelled") return true;
  const category = issueStatusCategory(issue);
  return category === "done" || category === "closed";
}

export function shouldShowInboxCompleteButton(args: {
  fromInbox: boolean;
  issue: Pick<Issue, "status" | "status_category"> | null | undefined;
  canEdit: boolean;
  isCompleting: boolean;
}): boolean {
  if (!args.fromInbox || !args.canEdit || !args.issue) return false;
  return args.isCompleting || !isIssueDoneOrCancelled(args.issue);
}

export function inboxRowsForIssue(
  items: readonly InboxItem[] | undefined,
  issueId: string,
): InboxItem[] {
  return (items ?? []).filter(
    (item) => item.issue_id === issueId && !item.archived,
  );
}

export type ArchiveInboxIssueRowsResult = {
  archivedIds: string[];
  archiveError: unknown | null;
};

export type CompleteInboxIssueResult = ArchiveInboxIssueRowsResult & {
  statusUpdated: true;
};

type ArchiveArgs = {
  issueId: string;
  listRows: () => readonly InboxItem[] | undefined;
  archiveRow: (id: string) => Promise<unknown>;
};

// One completion per issue at a time. A second tap reuses the first request's
// outcome instead of firing another status write and another archive loop.
const inFlightIssues = new Set<string>();

async function withIssueGuard<T>(
  issueId: string,
  run: () => Promise<T>,
): Promise<T | null> {
  if (inFlightIssues.has(issueId)) return null;
  inFlightIssues.add(issueId);
  try {
    return await run();
  } finally {
    inFlightIssues.delete(issueId);
  }
}

async function archiveRows(
  args: ArchiveArgs,
): Promise<ArchiveInboxIssueRowsResult> {
  const rows = inboxRowsForIssue(args.listRows(), args.issueId);
  const archivedIds: string[] = [];
  for (const row of rows) {
    try {
      await args.archiveRow(row.id);
      archivedIds.push(row.id);
    } catch (archiveError) {
      return { archivedIds, archiveError };
    }
  }
  return { archivedIds, archiveError: null };
}

/**
 * Mark the issue done, then archive every unarchived inbox row for it.
 *
 * The status write runs first and a failure aborts before any archive. Once
 * the status succeeds, archive failures are reported in the result instead of
 * throwing: the issue stays done, and the caller can retry only the archive.
 */
export async function completeInboxIssue(args: ArchiveArgs & {
  updateStatus: () => Promise<unknown>;
}): Promise<CompleteInboxIssueResult | null> {
  return withIssueGuard(args.issueId, async () => {
    await args.updateStatus();
    const archived = await archiveRows(args);
    return { statusUpdated: true, ...archived };
  });
}

export async function archiveInboxIssueRows(
  args: ArchiveArgs,
): Promise<ArchiveInboxIssueRowsResult | null> {
  return withIssueGuard(args.issueId, () => archiveRows(args));
}
