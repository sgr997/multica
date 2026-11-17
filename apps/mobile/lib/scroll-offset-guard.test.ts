import { describe, expect, it } from "vitest";
import {
  isAtBottomFromMetrics,
  recordedUserOffset,
  shouldRecoverFromUnintendedTop,
  shouldRestoreOffsetDuringHeaderAction,
  shouldRestoreOffsetAfterResize,
  shouldRestoreOffsetOnRefocus,
  viewportChanged,
} from "./scroll-offset-guard";

describe("viewportChanged", () => {
  it("ignores the first layout pass", () => {
    expect(viewportChanged(0, 700)).toBe(false);
  });

  it("ignores sub-pixel churn", () => {
    expect(viewportChanged(700, 700.25)).toBe(false);
  });

  it("detects a keyboard-sized change", () => {
    expect(viewportChanged(700, 400)).toBe(true);
  });
});

describe("shouldRestoreOffsetAfterResize", () => {
  it("restores a scrolled list after the viewport resizes", () => {
    expect(
      shouldRestoreOffsetAfterResize({
        savedOffset: 640,
        userInteracting: false,
        hasDeepLinkTarget: false,
      }),
    ).toBe(true);
  });

  it("does nothing at the top of the list", () => {
    expect(
      shouldRestoreOffsetAfterResize({
        savedOffset: 0,
        userInteracting: false,
        hasDeepLinkTarget: false,
      }),
    ).toBe(false);
  });

  it("never fights an active gesture", () => {
    expect(
      shouldRestoreOffsetAfterResize({
        savedOffset: 640,
        userInteracting: true,
        hasDeepLinkTarget: false,
      }),
    ).toBe(false);
  });

  it("leaves the deep-link landing alone", () => {
    expect(
      shouldRestoreOffsetAfterResize({
        savedOffset: 640,
        userInteracting: false,
        hasDeepLinkTarget: true,
      }),
    ).toBe(false);
  });
});

describe("recordedUserOffset", () => {
  it("records the offset while the finger is down", () => {
    expect(recordedUserOffset(400, 900, { restoring: false })).toBe(900);
  });

  it("keeps recording through momentum after the finger lifts", () => {
    // The previous position is 900; deceleration carries it to 1200 with the
    // finger already up. The saved value must follow the content.
    expect(recordedUserOffset(900, 1200, { restoring: false })).toBe(1200);
  });

  it("never records our own programmatic restore", () => {
    expect(recordedUserOffset(900, 0, { restoring: true })).toBe(900);
  });

  it("clamps pull-to-refresh overscroll to the top edge", () => {
    expect(recordedUserOffset(900, -60, { restoring: false })).toBe(0);
  });
});

describe("shouldRecoverFromUnintendedTop", () => {
  const base = {
    savedOffset: 900,
    previousOffsetY: 900,
    offsetY: 0,
    userInteracting: false,
    restoring: false,
  };

  it("catches a sudden jump to the top with no finger involved", () => {
    expect(shouldRecoverFromUnintendedTop(base)).toBe(true);
  });

  it("lets an animated status-bar scroll to top through", () => {
    // iOS animates that gesture in small steps; only the last one is at 0.
    expect(
      shouldRecoverFromUnintendedTop({
        ...base,
        previousOffsetY: 40,
        savedOffset: 60,
      }),
    ).toBe(false);
  });

  it("ignores scrolls the reader is driving", () => {
    expect(
      shouldRecoverFromUnintendedTop({ ...base, userInteracting: true }),
    ).toBe(false);
  });

  it("ignores the scroll event our own restore produces", () => {
    expect(
      shouldRecoverFromUnintendedTop({ ...base, restoring: true }),
    ).toBe(false);
  });

  it("has nothing to recover when the saved offset is already the top", () => {
    expect(
      shouldRecoverFromUnintendedTop({ ...base, savedOffset: 0 }),
    ).toBe(false);
  });

  it("ignores offsets that are not at the top", () => {
    expect(
      shouldRecoverFromUnintendedTop({ ...base, offsetY: 300 }),
    ).toBe(false);
  });

  it("replays the ActionSheet detach end to end", () => {
    let saved = 0;
    // Reader scrolls to 900 and lifts their finger.
    saved = recordedUserOffset(saved, 900, { restoring: false });
    // Presenting the ActionSheet detaches the native list: one event at 0,
    // no finger, no route change.
    expect(
      shouldRecoverFromUnintendedTop({
        savedOffset: saved,
        previousOffsetY: 900,
        offsetY: 0,
        userInteracting: false,
        restoring: false,
      }),
    ).toBe(true);
    // The re-applied 900 arrives as a programmatic scroll and must not
    // overwrite the saved value.
    saved = recordedUserOffset(saved, 900, { restoring: true });
    expect(saved).toBe(900);
  });
});

describe("isAtBottomFromMetrics", () => {
  const viewport = 800;

  it("is unknown before the first measurement", () => {
    expect(
      isAtBottomFromMetrics({
        contentHeight: 0,
        offsetY: 0,
        viewportHeight: 0,
      }),
    ).toBe(false);
  });

  it("treats content shorter than the viewport as the bottom", () => {
    expect(
      isAtBottomFromMetrics({
        contentHeight: 400,
        offsetY: 0,
        viewportHeight: viewport,
      }),
    ).toBe(true);
  });

  it("counts the slack band at the end of a long list", () => {
    expect(
      isAtBottomFromMetrics({
        contentHeight: 2400,
        offsetY: 2400 - viewport - 40,
        viewportHeight: viewport,
      }),
    ).toBe(true);
  });

  it("is false while reading in the middle", () => {
    expect(
      isAtBottomFromMetrics({
        contentHeight: 2400,
        offsetY: 600,
        viewportHeight: viewport,
      }),
    ).toBe(false);
  });
});

describe("shouldRestoreOffsetOnRefocus", () => {
  it("puts a mid-list reader back after a sheet is dismissed", () => {
    expect(shouldRestoreOffsetOnRefocus({ savedOffset: 900 })).toBe(true);
  });

  it("restores a reader who was pinned to the end", () => {
    expect(shouldRestoreOffsetOnRefocus({ savedOffset: 3200 })).toBe(true);
  });

  it("has nothing to restore for a list nobody scrolled", () => {
    expect(shouldRestoreOffsetOnRefocus({ savedOffset: 0 })).toBe(false);
  });
});

describe("shouldRestoreOffsetDuringHeaderAction", () => {
  const base = {
    savedOffset: 1800,
    userInteracting: false,
    restoring: false,
    guarding: true,
  };

  it("restores a partial unwind the snap detector would miss", () => {
    // 120 px in one event: below UNINTENDED_TOP_JUMP_PX and not at zero, so
    // shouldRecoverFromUnintendedTop ignores it.
    expect(
      shouldRestoreOffsetDuringHeaderAction({ ...base, offsetY: 1680 }),
    ).toBe(true);
  });

  it("restores an unwind that lands at the top", () => {
    expect(
      shouldRestoreOffsetDuringHeaderAction({ ...base, offsetY: 0 }),
    ).toBe(true);
  });

  it("ignores sub-pixel rounding", () => {
    expect(
      shouldRestoreOffsetDuringHeaderAction({ ...base, offsetY: 1799 }),
    ).toBe(false);
  });

  it("does nothing outside the header-action window", () => {
    expect(
      shouldRestoreOffsetDuringHeaderAction({
        ...base,
        guarding: false,
        offsetY: 0,
      }),
    ).toBe(false);
  });

  it("lets the reader's finger win", () => {
    expect(
      shouldRestoreOffsetDuringHeaderAction({
        ...base,
        userInteracting: true,
        offsetY: 0,
      }),
    ).toBe(false);
  });

  it("does not fight its own restore", () => {
    expect(
      shouldRestoreOffsetDuringHeaderAction({
        ...base,
        restoring: true,
        offsetY: 0,
      }),
    ).toBe(false);
  });
});
