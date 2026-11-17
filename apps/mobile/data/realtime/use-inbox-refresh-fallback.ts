/**
 * Inbox refresh fallback — the inbox's counterpart to
 * `use-chat-refresh-fallback`.
 *
 * The inbox list is normally kept fresh by `useInboxRealtime`, which patches
 * or refetches on every `inbox:*` / `issue:updated` frame. That only covers
 * the case where the frame actually arrives:
 *
 *   - iOS suspends the socket when the app backgrounds. Anything the server
 *     emitted meanwhile is gone if the reconnect handler does not fire (the
 *     app can be resumed onto an existing socket that never noticed).
 *   - A socket that cannot authenticate at all (proxy / Cloudflare Access /
 *     flaky cellular) delivers nothing, forever.
 *
 * In both cases the inbox was previously frozen until the reader pulled to
 * refresh — the "I have to pull down to see the current state" report. Chat
 * already covers this with polling; the inbox did not.
 *
 * Behaviour:
 *   - one refetch whenever the tab gains focus, the app returns to the
 *     foreground, or socket health changes (cheap, and it is exactly the
 *     moment the reader is looking);
 *   - while focused + foregrounded + disconnected, poll every 15 s;
 *   - stop when unfocused or backgrounded.
 */
import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { inboxKeys } from "@/data/queries/inbox";
import { useWSConnected } from "./realtime-provider";

/** Slower than chat's 4 s: nothing here is a live transcript, and the inbox
 *  is a list the reader scans rather than watches. */
export const INBOX_FALLBACK_POLL_INTERVAL_MS = 15_000;

/** Refetch the inbox list and the tab badge together — they are separate
 *  reads, so refreshing one leaves the badge disagreeing with the rows. */
export function refreshInboxCaches(
  qc: QueryClient,
  wsId: string | null,
) {
  if (!wsId) return;
  void qc.invalidateQueries({
    queryKey: inboxKeys.list(wsId),
    refetchType: "active",
  });
  void qc.invalidateQueries({
    queryKey: inboxKeys.unreadSummary(),
    refetchType: "active",
  });
}

function isForeground(status: AppStateStatus): boolean {
  return status !== "background" && status !== "inactive";
}

export function useInboxRefreshFallback({
  wsId,
  focused,
}: {
  wsId: string | null;
  focused: boolean;
}) {
  const qc = useQueryClient();
  const connected = useWSConnected();
  const [appActive, setAppActive] = useState(() =>
    isForeground(AppState.currentState),
  );
  const wsIdRef = useRef(wsId);
  wsIdRef.current = wsId;

  useEffect(() => {
    const sub = AppState.addEventListener("change", (status) => {
      setAppActive(isForeground(status));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!focused || !wsId) return;

    // One refetch per focus / foreground / connectivity transition. The
    // socket may have missed frames while this tab was not visible.
    refreshInboxCaches(qc, wsId);

    if (!appActive || connected) return;

    const timer = setInterval(() => {
      refreshInboxCaches(qc, wsIdRef.current);
    }, INBOX_FALLBACK_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [focused, wsId, appActive, connected, qc]);
}
