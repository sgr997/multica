/**
 * Per-agent instruction drafts.
 *
 * In-memory only, matching `chat-drafts-store`: the draft survives leaving
 * and reopening the editor within one app session, but not a cold start.
 * Persisting every keystroke to SecureStore would be wasteful and its 2KB
 * cap is too small for long prompts.
 *
 * `baseUpdatedAt` is the agent revision the draft started from — NOT the
 * latest server revision. A draft that outlives another editor's save must
 * still be detected as conflicting when it is finally saved.
 */
import { create } from "zustand";

export interface AgentInstructionsDraft {
  content: string;
  baseUpdatedAt: string;
}

interface AgentInstructionsDraftState {
  drafts: Record<string, AgentInstructionsDraft>;
  setDraft: (agentId: string, content: string, baseUpdatedAt: string) => void;
  clearDraft: (agentId: string) => void;
}

export const useAgentInstructionsDraftStore =
  create<AgentInstructionsDraftState>((set, get) => ({
    drafts: {},
    setDraft: (agentId, content, baseUpdatedAt) => {
      const current = get().drafts;
      const existing = current[agentId];
      if (existing?.content === content) return;
      set({
        drafts: {
          ...current,
          [agentId]: {
            content,
            baseUpdatedAt: existing?.baseUpdatedAt ?? baseUpdatedAt,
          },
        },
      });
    },
    clearDraft: (agentId) => {
      const current = get().drafts;
      if (!(agentId in current)) return;
      const next = { ...current };
      delete next[agentId];
      set({ drafts: next });
    },
  }));
