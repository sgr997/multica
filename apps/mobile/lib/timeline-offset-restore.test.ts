// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  requestTimelineOffsetRestore,
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
