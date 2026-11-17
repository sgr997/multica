/**
 * Which segment the Agents tab is showing. Kept in a store (not local state)
 * so `/more/squads` can switch the already-mounted tab screen to Squads
 * before navigating there — the tab root stays mounted for the whole session.
 */
import { create } from "zustand";

export type AgentsTabSegment = "agents" | "squads";

interface AgentsTabState {
  segment: AgentsTabSegment;
  setSegment: (segment: AgentsTabSegment) => void;
}

export const useAgentsTabStore = create<AgentsTabState>((set) => ({
  segment: "agents",
  setSegment: (segment) => set({ segment }),
}));
