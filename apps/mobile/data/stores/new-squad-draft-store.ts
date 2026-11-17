/**
 * Cross-route draft for the New Squad modal. Name and description are
 * controlled inputs local to `squad/new.tsx`; leader + preselected members
 * are chosen in formSheet picker routes and therefore live here (same
 * pattern as new-issue-draft-store / new-project-draft-store).
 */
import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { SquadMemberType } from "@multica/core/types";

export interface NewSquadMemberDraft {
  member_type: SquadMemberType;
  member_id: string;
}

interface NewSquadDraftState {
  name: string;
  description: string;
  leaderId: string | null;
  members: NewSquadMemberDraft[];
  setName: (name: string) => void;
  setDescription: (description: string) => void;
  setLeaderId: (id: string | null) => void;
  setMembers: (members: NewSquadMemberDraft[]) => void;
  reset: () => void;
}

const INITIAL = {
  name: "",
  description: "",
  leaderId: null,
  members: [] as NewSquadMemberDraft[],
};

export const useNewSquadDraftStore = create<NewSquadDraftState>((set) => ({
  ...INITIAL,
  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),
  setLeaderId: (leaderId) => set({ leaderId }),
  setMembers: (members) => set({ members }),
  reset: () => set({ ...INITIAL }),
}));

/** Clear the draft when the active workspace changes; member/agent ids from
 *  the previous workspace are not resolvable in the new one. */
export function useNewSquadDraftResetOnWorkspaceChange(wsId: string | null) {
  const previous = useRef(wsId);
  useEffect(() => {
    if (previous.current !== wsId) {
      useNewSquadDraftStore.getState().reset();
      previous.current = wsId;
    }
  }, [wsId]);
}
