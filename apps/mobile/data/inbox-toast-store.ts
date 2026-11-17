import { create } from "zustand";

type InboxToastState = {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
};

/**
 * One-shot confirmation shown by the inbox after a completion archives the
 * notification. Kept outside the detail screen because that screen is already
 * popping when the message needs to appear.
 */
export const useInboxToastStore = create<InboxToastState>((set) => ({
  message: null,
  show: (message) => set({ message }),
  clear: () => set({ message: null }),
}));
