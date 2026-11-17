import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";

export const squadKeys = {
  all: (wsId: string | null) => ["squads", wsId] as const,
  /** Prefix shared by the list and detail queries, matching the existing
   *  `["squads", wsId]` key so mention pickers and actor lookups refresh
   *  from the same invalidation point. */
  list: (wsId: string | null) => ["squads", wsId] as const,
  involved: (wsId: string | null) => ["squads", wsId, "involved"] as const,
  detail: (wsId: string | null, squadId: string) =>
    ["squads", wsId, "detail", squadId] as const,
  members: (wsId: string | null, squadId: string) =>
    ["squads", wsId, "detail", squadId, "members"] as const,
  memberStatus: (wsId: string | null, squadId: string) =>
    ["squads", wsId, "detail", squadId, "member-status"] as const,
};

export const squadListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: squadKeys.list(wsId),
    queryFn: ({ signal }) => api.listSquads({ signal }),
    enabled: !!wsId,
  });

export const involvedSquadIdsOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: squadKeys.involved(wsId),
    queryFn: ({ signal }) => api.listInvolvedSquadIds({ signal }),
    enabled: !!wsId,
  });

export const squadDetailOptions = (wsId: string | null, squadId: string) =>
  queryOptions({
    queryKey: squadKeys.detail(wsId, squadId),
    queryFn: ({ signal }) => api.getSquad(squadId, { signal }),
    enabled: !!wsId && !!squadId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

export const squadMembersOptions = (wsId: string | null, squadId: string) =>
  queryOptions({
    queryKey: squadKeys.members(wsId, squadId),
    queryFn: ({ signal }) => api.listSquadMembers(squadId, { signal }),
    enabled: !!wsId && !!squadId,
  });

/** Per-member working/idle/offline snapshot. The endpoint reads runtime +
 *  task state, so keep it fresh while the detail screen is foregrounded;
 *  `squad:*` events invalidate it through use-squad-realtime. */
export const squadMemberStatusOptions = (
  wsId: string | null,
  squadId: string,
) =>
  queryOptions({
    queryKey: squadKeys.memberStatus(wsId, squadId),
    queryFn: ({ signal }) => api.listSquadMemberStatus(squadId, { signal }),
    enabled: !!wsId && !!squadId,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
