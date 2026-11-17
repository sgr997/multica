/**
 * Workspace-lifetime squad list subscriptions.
 *
 *   - squad:created / squad:updated with a full row → patch list + detail;
 *   - squad:updated with only `squad_id` (member writes) → invalidate the
 *     squad tree so roster/status/preview all re-read;
 *   - squad:deleted → clear its record caches and refetch the list. DELETE
 *     archives rather than hard-deletes, so the row comes back with an
 *     archived badge; its issues transfer to the leader, so refresh those too;
 *   - reconnect → refetch the list.
 */
import { useQueryClient } from "@tanstack/react-query";
import { issueKeys } from "@/data/queries/issue-keys";
import { squadKeys } from "@/data/queries/squads";
import { useWSSubscriptions } from "@/lib/use-ws-subscriptions";
import {
  clearSquadCaches,
  parseSquadEventPayload,
  upsertSquadInList,
} from "./squad-ws-updaters";

export function useSquadsRealtime() {
  const qc = useQueryClient();

  useWSSubscriptions(
    (ws, wsId) => {
      const invalidateList = () =>
        qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });

      return [
        ws.on("squad:created", (payload) => {
          const { squad, squadId } = parseSquadEventPayload(payload);
          if (!squad) {
            if (squadId) {
              void qc.invalidateQueries({
                queryKey: squadKeys.detail(wsId, squadId),
              });
            }
            void invalidateList();
            return;
          }
          upsertSquadInList(qc, wsId, squad);
          qc.setQueryData(squadKeys.detail(wsId, squad.id), squad);
        }),
        ws.on("squad:updated", (payload) => {
          const { squad, squadId } = parseSquadEventPayload(payload);
          if (squad) {
            upsertSquadInList(qc, wsId, squad);
            qc.setQueryData(squadKeys.detail(wsId, squad.id), squad);
            if (squadId) {
              void qc.invalidateQueries({
                queryKey: squadKeys.members(wsId, squadId),
              });
              void qc.invalidateQueries({
                queryKey: squadKeys.memberStatus(wsId, squadId),
              });
            }
            return;
          }
          // Partial payload: membership/preview/status all changed. The
          // squad tree prefix covers list + every detail cache.
          void qc.invalidateQueries({ queryKey: squadKeys.all(wsId) });
        }),
        ws.on("squad:deleted", (payload) => {
          const { squadId } = parseSquadEventPayload(payload);
          if (!squadId) {
            void qc.invalidateQueries({ queryKey: squadKeys.all(wsId) });
            return;
          }
          clearSquadCaches(qc, wsId, squadId);
          void invalidateList();
          void qc.invalidateQueries({ queryKey: issueKeys.all(wsId) });
        }),
        ws.onReconnect(invalidateList),
      ];
    },
    [qc],
  );
}
