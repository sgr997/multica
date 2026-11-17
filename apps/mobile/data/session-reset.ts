import { queryClient } from "./query-client";
import { useAuthStore } from "./auth-store";
import { useWorkspaceStore } from "./workspace-store";
import { invalidateSessionEpoch } from "./session-epoch";

/** Drop every client-side artifact tied to the current backend. Realtime
 *  clients unmount with the app tree; navigation is replaced by the caller. */
export async function resetClientDataForServerSwitch(): Promise<void> {
  invalidateSessionEpoch();
  await useAuthStore.getState().logout();
  await useWorkspaceStore.getState().clear();
  queryClient.clear();
}
