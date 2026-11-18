import { create } from "zustand";

interface State {
  /** Plain text shown in the selection sheet. `null` closes it. */
  text: string | null;
  open: (text: string) => void;
  close: () => void;
}

/**
 * Owns the one shared text-selection sheet. Long-press actions on chat
 * messages and comments hand their plain text here instead of flipping the
 * bubble into an in-place selection mode — that mode needed a second
 * long-press, fought the scroll view, and made partial copies unreliable.
 */
export const useTextSelectionStore = create<State>((set) => ({
  text: null,
  open: (text) => set({ text }),
  close: () => set({ text: null }),
}));
