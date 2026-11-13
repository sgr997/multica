import { describe, expect, it } from "vitest";
import {
  recordedUserOffset,
  shouldRestoreOffsetAfterResize,
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
  it("records the offset while a gesture is in flight", () => {
    expect(recordedUserOffset(400, 900, true)).toBe(900);
  });

  it("ignores a layout-induced jump when no gesture is in flight", () => {
    expect(recordedUserOffset(900, 0, false)).toBe(900);
  });

  it("lets a reader-driven scroll to the top win", () => {
    expect(recordedUserOffset(900, 0, true)).toBe(0);
  });
});
