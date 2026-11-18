import { create } from "zustand";

interface State {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
}

/** App-wide one-shot confirmation toast (copy, saved, …). */
export const useAppToastStore = create<State>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}));
