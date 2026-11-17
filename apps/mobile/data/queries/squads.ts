import { queryOptions } from "@tanstack/react-query";
import type { Squad } from "@multica/core/types";
import { api } from "@/data/api";
import {
  collectInvolvedSquadIds,
  hasCompleteMemberPreview,
  squadsNeedingMemberLookup,
  type SquadInvolvementMember,
} from "@/lib/squads";

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

function involvementSignature(
  squads: readonly Squad[],
  userId: string | null,
  ownedAgentIds: ReadonlySet<string>,
): string {
  return [
    userId ?? "",
    [...ownedAgentIds].sort().join(","),
    ...squads.map((squad) => {
      const preview = (squad.member_preview ?? [])
        .map((member) => `${member.member_type}:${member.member_id}`)
        .join(",");
      return `${squad.id}:${squad.leader_id}:${squad.member_count ?? "?"}:${preview}`;
    }),
  ].join("|");
}

/**
 * Squad involvement for the "mine" scope, derived from the squad list and
 * per-squad member lists. `/api/squads/involved` exists only on newer
 * backends, so the mobile list must not depend on it: older self-hosted
 * deployments answer that path with `invalid squad id`.
 *
 * Complete member previews avoid a request; larger squads load their members
 * in bounded batches.
 */
export const involvedSquadIdsOptions = (
  wsId: string | null,
  squads: readonly Squad[],
  userId: string | null,
  ownedAgentIds: ReadonlySet<string>,
  agentsLoaded: boolean,
) => {
  const lookupSquads = squadsNeedingMemberLookup(squads, ownedAgentIds);
  const signature = involvementSignature(squads, userId, ownedAgentIds);

  return queryOptions({
    queryKey: [...squadKeys.involved(wsId), signature] as const,
    queryFn: async ({ signal }): Promise<string[]> => {
      if (!userId) return [];

      const membersBySquad = new Map<string, readonly SquadInvolvementMember[]>();
      for (const squad of squads) {
        if (hasCompleteMemberPreview(squad)) {
          membersBySquad.set(squad.id, squad.member_preview ?? []);
        }
      }

      const BATCH_SIZE = 4;
      for (let i = 0; i < lookupSquads.length; i += BATCH_SIZE) {
        const batch = lookupSquads.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (squad) => {
            try {
              const members = await api.listSquadMembers(squad.id, {
                signal,
              });
              membersBySquad.set(squad.id, members);
            } catch (error) {
              if (signal.aborted) throw error;
              console.warn("[squads] involvement lookup failed", {
                squadId: squad.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }),
        );
      }

      return collectInvolvedSquadIds(
        squads,
        membersBySquad,
        userId,
        ownedAgentIds,
      );
    },
    enabled: !!wsId && !!userId && agentsLoaded && squads.length > 0,
    staleTime: 60_000,
  });
};

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
