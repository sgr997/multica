/**
 * Keeps the server-side read watermark in step with what the reader has
 * actually seen inside an open chat session.
 *
 * The old wiring only fired when `has_unread` flipped to true. That left two
 * holes:
 *
 *   1. The flag could be coalesced away (true → false → true between two
 *      renders), so a reply that arrived while the reader was already in the
 *      session never produced a read request.
 *   2. Leaving the screen had no final flush. The session list refetch landed
 *      after the effect had stopped running and the tab badge kept the count.
 *
 * The scheduler watches the real signal instead: the tail message id and the
 * session's unread pair (`has_unread` OR `unread_count > 0`, because the two
 * are maintained by different cache paths). Reads are leading + trailing
 * throttled so a burst of assistant output produces one request, and
 * `leave()` flushes the pending marker when the reader leaves the session.
 */

export interface ChatReadSnapshot {
  sessionId: string | null;
  /** Screen focused AND app in the foreground. Reads are never sent while
   *  the app is backgrounded, matching web's semantics. */
  focused: boolean;
  /** Newest message id in the visible transcript; null while loading or when
   *  the session is empty. */
  lastMessageId: string | null;
  /** The server still reports unread state for this session. Callers pass
   *  `has_unread || unread_count > 0` so neither field can keep the badge
   *  alive on its own. */
  unread: boolean;
}

export interface ChatReadSchedulerOptions {
  markRead: (sessionId: string) => void;
  throttleMs?: number;
  now?: () => number;
}

export const CHAT_READ_THROTTLE_MS = 400;

export class ChatReadScheduler {
  private readonly markRead: (sessionId: string) => void;
  private readonly throttleMs: number;
  private readonly now: () => number;

  private sessionId: string | null = null;
  private baseline: string | null = null;
  private acked: string | null = null;
  /** Marker we already re-read once to repair a stale refetch. */
  private reverified: string | null = null;
  private pending: string | null = null;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSentAt = 0;

  constructor(options: ChatReadSchedulerOptions) {
    this.markRead = options.markRead;
    this.throttleMs = options.throttleMs ?? CHAT_READ_THROTTLE_MS;
    this.now = options.now ?? Date.now;
  }

  update(snapshot: ChatReadSnapshot): void {
    const { sessionId, focused, lastMessageId, unread } = snapshot;

    if (sessionId !== this.sessionId) {
      this.sessionId = sessionId;
      // The first transcript load is history the reader has not "read" in
      // this visit; only an unread pair forces a request on entry.
      this.baseline = lastMessageId;
      this.acked = lastMessageId;
      this.reverified = null;
      this.pending = null;
      this.dirty = false;
      this.clearTimer();
    }

    if (!sessionId || !focused) {
      this.clearTimer();
      return;
    }
    if (lastMessageId === null) return;

    const tailChanged =
      this.baseline !== null && lastMessageId !== this.baseline;
    if (!unread && !tailChanged) {
      this.dirty = false;
      return;
    }

    if (lastMessageId === this.acked) {
      // Nothing new to read. Repeated unread from a refetch that raced the
      // write is repaired exactly once per marker.
      if (!unread || this.reverified === lastMessageId) {
        this.dirty = false;
        return;
      }
      this.reverified = lastMessageId;
    }

    this.schedule(lastMessageId);
  }

  /** The reader left the session (blur, back, tab switch): flush the read
   *  they already earned before the screen goes away. */
  leave(): void {
    this.clearTimer();
    if (this.dirty) this.flush();
  }

  /** App went to the background: cancel the timer but keep the pending
   *  marker. Reads are not sent off-screen. */
  suspend(): void {
    this.clearTimer();
  }

  private schedule(marker: string): void {
    this.dirty = true;
    this.pending = marker;
    const elapsed = this.now() - this.lastSentAt;
    const wait = Math.max(0, this.throttleMs - elapsed);
    if (wait === 0 && this.timer === null) {
      this.flush();
      return;
    }
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, wait);
  }

  private flush(): void {
    const sessionId = this.sessionId;
    const marker = this.pending;
    this.pending = null;
    this.dirty = false;
    this.clearTimer();
    if (!sessionId || marker === null) return;
    this.acked = marker;
    this.lastSentAt = this.now();
    this.markRead(sessionId);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
