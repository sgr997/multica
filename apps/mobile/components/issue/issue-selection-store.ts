import { create } from "zustand";
import {
  retainVisibleSelection,
  selectAllVisible,
  toggleSelection,
} from "@/lib/issue-batch";

export type BatchFeedback = {
  kind: "success" | "warning" | "error";
  messageKey?: string;
  params?: Record<string, unknown>;
  message?: string;
};

type Surface = string;

interface IssueSelectionState {
  selections: Record<Surface, string[]>;
  pending: Record<Surface, boolean>;
  feedback: Record<Surface, BatchFeedback | null>;
  activate: (surface: Surface) => void;
  setSelection: (surface: Surface, ids: readonly string[]) => void;
  toggle: (surface: Surface, id: string) => void;
  selectAll: (surface: Surface, visibleIds: readonly string[]) => void;
  retainVisible: (surface: Surface, visibleIds: readonly string[]) => void;
  clear: (surface: Surface) => void;
  clearAll: () => void;
  setPending: (surface: Surface, pending: boolean) => void;
  setFeedback: (surface: Surface, feedback: BatchFeedback | null) => void;
}

const EMPTY_IDS: string[] = [];

export function issueSelectionIds(
  state: Pick<IssueSelectionState, "selections">,
  surface: Surface,
): string[] {
  return state.selections[surface] ?? EMPTY_IDS;
}

export const useIssueSelectionStore = create<IssueSelectionState>((set) => ({
  selections: {},
  pending: {},
  feedback: {},
  activate: (surface) =>
    set((state) => {
      const nextSelections: Record<Surface, string[]> = {};
      const nextPending: Record<Surface, boolean> = {};
      const nextFeedback: Record<Surface, BatchFeedback | null> = {};
      for (const key of Object.keys(state.selections)) {
        if (key === surface) {
          nextSelections[key] = state.selections[key] ?? EMPTY_IDS;
        }
      }
      if (!nextSelections[surface]) nextSelections[surface] = EMPTY_IDS;
      for (const key of [surface]) {
        if (state.pending[key] !== undefined) nextPending[key] = state.pending[key]!;
        if (state.feedback[key] !== undefined) nextFeedback[key] = state.feedback[key]!;
      }
      return {
        selections: nextSelections,
        pending: nextPending,
        feedback: nextFeedback,
      };
    }),
  setSelection: (surface, ids) =>
    set((state) => ({
      selections: { ...state.selections, [surface]: [...new Set(ids)] },
    })),
  toggle: (surface, id) =>
    set((state) => ({
      selections: {
        ...state.selections,
        [surface]: toggleSelection(issueSelectionIds(state, surface), id),
      },
    })),
  selectAll: (surface, visibleIds) =>
    set((state) => ({
      selections: {
        ...state.selections,
        [surface]: selectAllVisible(visibleIds),
      },
    })),
  retainVisible: (surface, visibleIds) =>
    set((state) => {
      const current = issueSelectionIds(state, surface);
      const next = retainVisibleSelection(current, visibleIds);
      if (next.length === current.length && next.every((id, i) => id === current[i])) {
        return state;
      }
      return {
        selections: { ...state.selections, [surface]: next },
      };
    }),
  clear: (surface) =>
    set((state) => ({
      selections: { ...state.selections, [surface]: EMPTY_IDS },
      pending: { ...state.pending, [surface]: false },
      feedback: { ...state.feedback, [surface]: null },
    })),
  clearAll: () => set({ selections: {}, pending: {}, feedback: {} }),
  setPending: (surface, pending) =>
    set((state) => ({
      pending: { ...state.pending, [surface]: pending },
    })),
  setFeedback: (surface, feedback) =>
    set((state) => ({
      feedback: { ...state.feedback, [surface]: feedback },
    })),
}));
