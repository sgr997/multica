// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  beginTimelineOffsetGuard,
  requestTimelineOffsetRestore,
  subscribeTimelineOffsetGuard,
  subscribeTimelineOffsetRestore,
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
