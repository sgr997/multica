// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { countUnreadChatMessages } from "@multica/core/chat/unread";
import type { ChatSession } from "@multica/core/types";

import {
  ChatReadScheduler,
  CHAT_READ_THROTTLE_MS,
  type ChatReadSnapshot,
} from "./chat-session-read";
import { clearSessionUnread } from "./realtime/chat-ws-updaters";
import { chatKeys } from "./queries/chat";

vi.mock("@/data/api", () => ({ api: {} }));

const SESSION = "session-1";
const WS = "ws-1";

function snapshot(over: Partial<ChatReadSnapshot> = {}): ChatReadSnapshot {
  return {
    sessionId: SESSION,
    focused: true,
    lastMessageId: "msg-1",
    unread: false,
    ...over,
  };
}

describe("ChatReadScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not mark history read on entry when the session is already read", () => {
    const markRead = vi.fn();
    const scheduler = new ChatReadScheduler({ markRead });

    scheduler.update(snapshot());
    scheduler.update(snapshot());
    vi.runAllTimers();

    expect(markRead).not.toHaveBeenCalled();
  });

  it("marks a session read immediately when it enters with unread state", () => {
    const markRead = vi.fn();
    const scheduler = new ChatReadScheduler({ markRead });

    scheduler.update(snapshot({ unread: true }));

    expect(markRead).toHaveBeenCalledExactlyOnceWith(SESSION);
  });

  it("marks each new transcript tail read, coalescing a burst", () => {
    const markRead = vi.fn();
    const scheduler = new ChatReadScheduler({ markRead });

    scheduler.update(snapshot());
    scheduler.update(snapshot({ lastMessageId: "msg-2" }));
    expect(markRead).toHaveBeenCalledTimes(1);

    scheduler.update(snapshot({ lastMessageId: "msg-3" }));
    scheduler.update(snapshot({ lastMessageId: "msg-4" }));
    expect(markRead).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CHAT_READ_THROTTLE_MS);
    expect(markRead).toHaveBeenCalledTimes(2);
  });

  it("flushes the earned read when the reader leaves the session", () => {
    const markRead = vi.fn();
    let clock = 1_000;
    const scheduler = new ChatReadScheduler({
      markRead,
      now: () => clock,
    });

    // First read lands immediately; the second is inside the throttle window.
    scheduler.update(snapshot());
    scheduler.update(snapshot({ lastMessageId: "msg-2" }));
    clock += 50;
    scheduler.update(snapshot({ lastMessageId: "msg-3" }));
    expect(markRead).toHaveBeenCalledTimes(1);

    scheduler.leave();
    expect(markRead).toHaveBeenCalledTimes(2);
  });

  it("treats has_unread=false with unread_count>0 as unread", () => {
    const markRead = vi.fn();
    const scheduler = new ChatReadScheduler({ markRead });

    // The caller derives `unread` from both fields, so a count-only residue
    // still produces a read instead of leaving the badge pinned.
    scheduler.update(
      snapshot({ unread: true, lastMessageId: "msg-1" }),
    );

    expect(markRead).toHaveBeenCalledExactlyOnceWith(SESSION);
  });

  it("never sends while backgrounded and resumes on return", () => {
    const markRead = vi.fn();
    const scheduler = new ChatReadScheduler({ markRead, now: () => 0 });

    scheduler.update(snapshot());
    scheduler.update(snapshot({ lastMessageId: "msg-2" }));
    scheduler.suspend();
    vi.runAllTimers();
    expect(markRead).not.toHaveBeenCalled();

    scheduler.update(snapshot({ lastMessageId: "msg-2" }));
    vi.advanceTimersByTime(CHAT_READ_THROTTLE_MS);
    expect(markRead).toHaveBeenCalledTimes(1);
  });
});

describe("clearSessionUnread", () => {
  it("clears both unread fields so the tab badge stops counting the session", () => {
    const qc = new QueryClient();
    const session = {
      id: SESSION,
      has_unread: false,
      unread_count: 3,
    } as unknown as ChatSession;
    qc.setQueryData<ChatSession[]>(chatKeys.sessions(WS), [session]);

    expect(countUnreadChatMessages([session])).toBe(3);

    clearSessionUnread(qc, WS, SESSION);

    const patched = qc.getQueryData<ChatSession[]>(chatKeys.sessions(WS));
    expect(patched?.[0].has_unread).toBe(false);
    expect(patched?.[0].unread_count).toBe(0);
    expect(countUnreadChatMessages(patched ?? [])).toBe(0);
  });
});
