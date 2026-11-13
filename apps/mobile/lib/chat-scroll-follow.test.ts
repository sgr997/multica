import { describe, expect, it } from "vitest";
import {
  CHAT_BOTTOM_SLACK_PX,
  distanceFromBottom,
  followAfterUserScroll,
  isAtBottom,
  shouldAutoScrollToLatest,
} from "./chat-scroll-follow";

describe("distanceFromBottom", () => {
  it("measures the content hidden below the viewport", () => {
    expect(
      distanceFromBottom({
        contentHeight: 2000,
        offsetY: 900,
        viewportHeight: 800,
      }),
    ).toBe(300);
  });

  it("clamps to zero when the content is shorter than the viewport", () => {
    expect(
      distanceFromBottom({
        contentHeight: 400,
        offsetY: 0,
        viewportHeight: 800,
      }),
    ).toBe(0);
  });
});

describe("isAtBottom", () => {
  it("treats the slack band as 'at the bottom'", () => {
    expect(
      isAtBottom(
        {
          contentHeight: 2000,
          offsetY: 2000 - 800 - CHAT_BOTTOM_SLACK_PX,
          viewportHeight: 800,
        },
      ),
    ).toBe(true);
  });

  it("reports false once the reader is past the slack band", () => {
    expect(
      isAtBottom({
        contentHeight: 2000,
        offsetY: 2000 - 800 - CHAT_BOTTOM_SLACK_PX - 1,
        viewportHeight: 800,
      }),
    ).toBe(false);
  });
});

describe("followAfterUserScroll", () => {
  it("re-pins when the gesture ends near the newest row", () => {
    expect(
      followAfterUserScroll({
        contentHeight: 2000,
        offsetY: 1190,
        viewportHeight: 800,
      }),
    ).toBe(true);
  });

  it("unpins when the gesture ends in history", () => {
    expect(
      followAfterUserScroll({
        contentHeight: 2000,
        offsetY: 400,
        viewportHeight: 800,
      }),
    ).toBe(false);
  });
});

describe("shouldAutoScrollToLatest", () => {
  it("follows content growth while pinned to the bottom", () => {
    expect(
      shouldAutoScrollToLatest({
        following: true,
        userInteracting: false,
        lastMessageIsUser: false,
      }),
    ).toBe(true);
  });

  it("leaves a reader in history alone when a reply streams in", () => {
    expect(
      shouldAutoScrollToLatest({
        following: false,
        userInteracting: false,
        lastMessageIsUser: false,
      }),
    ).toBe(false);
  });

  it("never fights an active gesture", () => {
    expect(
      shouldAutoScrollToLatest({
        following: true,
        userInteracting: true,
        lastMessageIsUser: false,
      }),
    ).toBe(false);
  });

  it("jumps to the newest row when the user sends a message", () => {
    expect(
      shouldAutoScrollToLatest({
        following: false,
        userInteracting: false,
        lastMessageIsUser: true,
      }),
    ).toBe(true);
  });
});
