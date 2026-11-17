import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Issue, UpdateIssueRequest } from "@multica/core/types";
import { useIssueSelectionStore } from "@/components/issue/issue-selection-store";
import { issueKeys } from "@/data/queries/issue-keys";
import { useBatchUpdateIssues } from "@/data/mutations/issues";
import { useWorkspaceStore } from "@/data/workspace-store";
import { batchWriteOutcome } from "@/lib/issue-batch";

const EMPTY_IDS: string[] = [];

function isIssue(value: unknown): value is Issue {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    "status" in value &&
    "identifier" in value
  );
}

/**
 * The picker sheet runs above the list that owns the selection. The selected
 * issue ids live in client state, but their server rows stay in TanStack Query
 * caches; recovering them from the issue cache avoids copying server data into
 * Zustand just to cross the sheet boundary.
 */
function findCachedIssues(
  qc: ReturnType<typeof useQueryClient>,
  wsId: string | null,
  ids: readonly string[],
): Issue[] {
  if (!wsId || ids.length === 0) return [];
  const wanted = new Set(ids);
  const found = new Map<string, Issue>();
  for (const [, data] of qc.getQueriesData<unknown>({
    queryKey: issueKeys.all(wsId),
  })) {
    if (!Array.isArray(data)) continue;
    for (const entry of data) {
      if (isIssue(entry) && wanted.has(entry.id)) found.set(entry.id, entry);
    }
  }
  return ids.flatMap((id) => {
    const issue = found.get(id);
    return issue ? [issue] : [];
  });
}

export function useBatchPicker(surface: string | undefined) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const ids = useIssueSelectionStore((state) =>
    surface ? state.selections[surface] ?? EMPTY_IDS : EMPTY_IDS,
  );
  const pending = useIssueSelectionStore((state) =>
    surface ? state.pending[surface] ?? false : false,
  );
  const setPending = useIssueSelectionStore((state) => state.setPending);
  const setFeedback = useIssueSelectionStore((state) => state.setFeedback);
  const batchUpdate = useBatchUpdateIssues();

  const issues = useMemo(
    () => findCachedIssues(qc, wsId, ids),
    [ids, qc, wsId],
  );

  const apply = useCallback(
    (updates: UpdateIssueRequest) => {
      if (!surface || ids.length === 0 || pending) return;
      setPending(surface, true);
      void batchUpdate
        .mutateAsync({ ids, updates })
        .then(({ updated }) => {
          const outcome = batchWriteOutcome(updated, ids.length);
          setFeedback(
            surface,
            outcome === "partial"
              ? {
                  kind: "warning",
                  messageKey: "batch.update_partial",
                  params: { updated, count: ids.length },
                }
              : {
                  kind: "success",
                  messageKey: "batch.update_success",
                  params: { count: updated },
                },
          );
        })
        .catch((error: unknown) => {
          setFeedback(surface, {
            kind: "error",
            messageKey: "batch.update_failed",
            message: error instanceof Error ? error.message : undefined,
          });
        })
        .finally(() => setPending(surface, false));
    },
    [batchUpdate, ids, pending, setFeedback, setPending, surface],
  );

  return {
    surface,
    ids,
    issues,
    pending,
    apply,
  };
}
