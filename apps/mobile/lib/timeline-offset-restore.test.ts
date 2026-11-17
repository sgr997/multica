// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  beginTimelineOffsetGuard,
  requestTimelineOffsetRestore,
  requestTimelineScrollToTop,
  subscribeTimelineOffsetGuard,
  subscribeTimelineOffsetRestore,
  subscribeTimelineScrollToTop,
} from "./timeline-offset-restore";

describe("timeline offset restore", () => {
  it("notifies every mounted listener and stops after unsubscribe", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribeTimelineOffsetRestore(first);
    const unsubscribeSecond = subscribeTimelineOffsetRestore(second);

    requestTimelineOffsetRestore();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubscribeFirst();
    requestTimelineOffsetRestore();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeSecond();
  });

  it("is a no-op when no timeline is mounted", () => {
    expect(() => requestTimelineOffsetRestore()).not.toThrow();
  });
});

describe("timeline offset guard", () => {
  it("opens on press, independently of the dismissal channel", () => {
    const onGuard = vi.fn();
    const onRestore = vi.fn();
    const unsubscribeGuard = subscribeTimelineOffsetGuard(onGuard);
    const unsubscribeRestore = subscribeTimelineOffsetRestore(onRestore);

    beginTimelineOffsetGuard();
    expect(onGuard).toHaveBeenCalledTimes(1);
    expect(onRestore).not.toHaveBeenCalled();

    unsubscribeGuard();
    unsubscribeRestore();
  });

  it("is a no-op when no timeline is mounted", () => {
    expect(() => beginTimelineOffsetGuard()).not.toThrow();
  });
});

describe("timeline scroll to top", () => {
  it("is its own channel — it must not re-trigger an offset restore", () => {
    const onScrollToTop = vi.fn();
    const onRestore = vi.fn();
    const onGuard = vi.fn();
    const unsubTop = subscribeTimelineScrollToTop(onScrollToTop);
    const unsubRestore = subscribeTimelineOffsetRestore(onRestore);
    const unsubGuard = subscribeTimelineOffsetGuard(onGuard);

    requestTimelineScrollToTop();
    expect(onScrollToTop).toHaveBeenCalledTimes(1);
    // Restoring the reader's old offset right after they asked for the top
    // would yank them straight back down.
    expect(onRestore).not.toHaveBeenCalled();
    expect(onGuard).not.toHaveBeenCalled();

    unsubTop();
    unsubRestore();
    unsubGuard();
  });
});
