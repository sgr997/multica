/**
 * Squad event payload narrowing + cache helpers.
 *
 * `squad:created` / `squad:updated` carry a full squad in most cases, but
 * member add/remove/role writes publish `{ squad_id }` only (see
 * server/internal/handler/squad.go). The helpers therefore expose both the
 * optional squad row and the id, and callers invalidate when the row is
 * absent instead of guessing a partial patch.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { Squad } from "@multica/core/types";
import { squadKeys } from "@/data/queries/squads";

export interface SquadEventPayload {
  squad?: Squad;
  squadId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseSquadEventPayload(
  payload: unknown,
): SquadEventPayload {
  if (!isRecord(payload)) return {};
  const squad = isRecord(payload.squad)
    ? (payload.squad as unknown as Squad)
    : undefined;
  const squadId =
    typeof payload.squad_id === "string"
      ? payload.squad_id
      : squad?.id;
  return { squad, squadId };
}

export function upsertSquadInList(
  qc: QueryClient,
  wsId: string,
  squad: Squad,
) {
  qc.setQueryData<Squad[]>(squadKeys.list(wsId), (old) => {
    if (!old) return old;
    return old.some((item) => item.id === squad.id)
      ? old.map((item) => (item.id === squad.id ? squad : item))
      : [squad, ...old];
  });
}

export function clearSquadCaches(
  qc: QueryClient,
  wsId: string,
  squadId: string,
) {
  qc.removeQueries({ queryKey: squadKeys.detail(wsId, squadId) });
  qc.removeQueries({ queryKey: squadKeys.members(wsId, squadId) });
  qc.removeQueries({ queryKey: squadKeys.memberStatus(wsId, squadId) });
}
