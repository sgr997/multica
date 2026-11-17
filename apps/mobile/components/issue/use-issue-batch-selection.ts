import { useCallback, useEffect, useMemo } from "react";
import type { Issue } from "@multica/core/types";
import {
  issueSelectionIds,
  useIssueSelectionStore,
} from "@/components/issue/issue-selection-store";

const EMPTY_IDS: string[] = [];

export function useIssueBatchSelection(
  surface: string,
  visibleIssues: readonly Issue[],
) {
  const selectedIds = useIssueSelectionStore(
    (state) => state.selections[surface] ?? EMPTY_IDS,
  );
  const activate = useIssueSelectionStore((state) => state.activate);
  const setSelection = useIssueSelectionStore((state) => state.setSelection);
  const toggle = useIssueSelectionStore((state) => state.toggle);
  const selectAll = useIssueSelectionStore((state) => state.selectAll);
  const retainVisible = useIssueSelectionStore((state) => state.retainVisible);
  const clear = useIssueSelectionStore((state) => state.clear);

  const visibleIds = useMemo(
    () => visibleIssues.map((issue) => issue.id),
    [visibleIssues],
  );

  useEffect(() => {
    retainVisible(surface, visibleIds);
  }, [retainVisible, surface, visibleIds]);

  useEffect(
    () => () => {
      clear(surface);
    },
    [clear, surface],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedIssues = useMemo(
    () => visibleIssues.filter((issue) => selectedSet.has(issue.id)),
    [selectedSet, visibleIssues],
  );

  const startSelection = useCallback(
    (id: string) => {
      activate(surface);
      const current = issueSelectionIds(
        useIssueSelectionStore.getState(),
        surface,
      );
      if (current.length === 0) {
        setSelection(surface, [id]);
      } else {
        toggle(surface, id);
      }
    },
    [activate, setSelection, surface, toggle],
  );

  return {
    selectedIds: selectedSet,
    selectedIssues,
    count: selectedIssues.length,
    selecting: selectedIssues.length > 0,
    startSelection,
    toggle: useCallback(
      (id: string) => {
        activate(surface);
        toggle(surface, id);
      },
      [activate, surface, toggle],
    ),
    selectAll: useCallback(() => {
      activate(surface);
      selectAll(surface, visibleIds);
    }, [activate, selectAll, surface, visibleIds]),
    clear: useCallback(() => clear(surface), [clear, surface]),
  };
}
