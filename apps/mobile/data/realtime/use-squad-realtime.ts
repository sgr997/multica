/**
 * Per-squad realtime subscriptions, mounted by the detail screen.
 *
 * Full `squad:updated` payloads replace the detail row; partial payloads
 * (member writes) invalidate the roster + status snapshot. `squad:deleted`
 * clears the record caches, refetches the list (DELETE archives, so the row
 * remains visible with a badge) and pops the screen.
 */
import { useQueryClient } from "@tanstack/react-query";
import { squadKeys } from "@/data/queries/squads";
import { useWSSubscriptions } from "@/lib/use-ws-subscriptions";
import {
  clearSquadCaches,
  parseSquadEventPayload,
} from "./squad-ws-updaters";

export function useSquadRealtime(
  squadId: string | undefined,
  onDeleted?: () => void,
) {
  const qc = useQueryClient();

  useWSSubscriptions(
    (ws, wsId) => {
      if (!squadId) return;

      const invalidateRecord = () => {
        void qc.invalidateQueries({
          queryKey: squadKeys.detail(wsId, squadId),
        });
        void qc.invalidateQueries({
          queryKey: squadKeys.members(wsId, squadId),
        });
        void qc.invalidateQueries({
          queryKey: squadKeys.memberStatus(wsId, squadId),
        });
      };

      return [
        ws.on("squad:updated", (payload) => {
          const { squad, squadId: changedId } =
            parseSquadEventPayload(payload);
          if (changedId && changedId !== squadId) return;
          if (!changedId && !squad) {
            // Defensive: an unidentifiable payload could belong to any
            // squad. Refetch rather than patch the wrong record.
            void invalidateRecord();
            return;
          }
          if (squad) {
            qc.setQueryData(squadKeys.detail(wsId, squadId), squad);
          }
          void qc.invalidateQueries({
            queryKey: squadKeys.members(wsId, squadId),
          });
          void qc.invalidateQueries({
            queryKey: squadKeys.memberStatus(wsId, squadId),
          });
          void qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });
        }),
        ws.on("squad:deleted", (payload) => {
          const { squadId: deletedId } = parseSquadEventPayload(payload);
          if (deletedId && deletedId !== squadId) return;
          clearSquadCaches(qc, wsId, squadId);
          void qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });
          onDeleted?.();
        }),
        ws.onReconnect(invalidateRecord),
      ];
    },
    [squadId, qc, onDeleted],
  );
}
