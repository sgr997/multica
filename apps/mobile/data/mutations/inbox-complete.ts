import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InboxItem } from "@multica/core/types";
import { inboxKeys } from "@/data/queries/inbox";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  archiveInboxIssueRows,
  completeInboxIssue,
} from "@/lib/inbox-complete";
import { useArchiveInbox } from "./inbox";
import { useUpdateIssue } from "./issues";

/**
 * Inbox-originated "mark done and archive" flow.
 *
 * Status is written through the same `useUpdateIssue` mutation every other
 * status surface uses, so its existing detail/my-issues/list invalidation
 * stays the only refresh path. Archiving then reuses `useArchiveInbox` per
 * cached row, keeping that mutation's optimistic patch and rollback.
 */
export function useCompleteInboxIssue(issueId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const updateIssue = useUpdateIssue(issueId);
  const archive = useArchiveInbox();

  const listRows = () =>
    qc.getQueryData<InboxItem[]>(inboxKeys.list(wsId));
  const archiveRow = (id: string) => archive.mutateAsync(id);

  const complete = useMutation({
    mutationFn: () =>
      completeInboxIssue({
        issueId,
        updateStatus: () => updateIssue.mutateAsync({ status: "done" }),
        listRows,
        archiveRow,
      }),
  });

  const retryArchive = useMutation({
    mutationFn: () =>
      archiveInboxIssueRows({ issueId, listRows, archiveRow }),
  });

  return { complete, retryArchive };
}
