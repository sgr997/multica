// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { inboxKeys } from "@/data/queries/inbox";
import {
  INBOX_FALLBACK_POLL_INTERVAL_MS,
  useInboxRefreshFallback,
} from "./use-inbox-refresh-fallback";

const harness = vi.hoisted(() => ({
  connected: false,
  cleanups: [] as (() => void)[],
  invalidateQueries: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (setup: () => void | (() => void)) => {
    const cleanup = setup();
    if (cleanup) harness.cleanups.push(cleanup);
  },
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [
    typeof initial === "function" ? (initial as () => unknown)() : initial,
    () => {},
  ],
}));

vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: () => ({ remove: vi.fn() }),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: harness.invalidateQueries }),
}));

vi.mock("./realtime-provider", () => ({
  useWSConnected: () => harness.connected,
}));

vi.mock("@/data/api", () => ({ api: {} }));

function runHook(options: { wsId?: string | null; focused?: boolean } = {}) {
  useInboxRefreshFallback({
    wsId: options.wsId === undefined ? "ws-1" : options.wsId,
    focused: options.focused ?? true,
  });
}

describe("useInboxRefreshFallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    harness.connected = false;
    harness.cleanups = [];
    harness.invalidateQueries.mockReset();
  });

  afterEach(() => {
    for (const cleanup of harness.cleanups) cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refreshes the list and the badge the moment the tab is shown", () => {
    runHook();

    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: inboxKeys.list("ws-1"),
      refetchType: "active",
    });
    expect(harness.invalidateQueries).toHaveBeenCalledWith({
      queryKey: inboxKeys.unreadSummary(),
      refetchType: "active",
    });
  });

  it("polls while the socket is down", () => {
    runHook();
    harness.invalidateQueries.mockClear();

    vi.advanceTimersByTime(INBOX_FALLBACK_POLL_INTERVAL_MS);
    expect(harness.invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it("stops polling once the socket is authenticated", () => {
    harness.connected = true;
    runHook();
    harness.invalidateQueries.mockClear();

    vi.advanceTimersByTime(INBOX_FALLBACK_POLL_INTERVAL_MS * 3);
    expect(harness.invalidateQueries).not.toHaveBeenCalled();
  });

  it("stays idle when the tab is not focused or no workspace is bound", () => {
    runHook({ focused: false });
    runHook({ wsId: null });

    expect(harness.invalidateQueries).not.toHaveBeenCalled();
    vi.advanceTimersByTime(INBOX_FALLBACK_POLL_INTERVAL_MS * 2);
    expect(harness.invalidateQueries).not.toHaveBeenCalled();
  });
});
