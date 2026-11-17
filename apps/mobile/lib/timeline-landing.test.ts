import { describe, expect, it } from "vitest";
import { decideTimelineLanding } from "./timeline-landing";

function input(
  overrides: Partial<Parameters<typeof decideTimelineLanding>[0]> = {},
) {
  return {
    fromInbox: true,
    hasActiveRun: true,
    hasHighlight: false,
    userHasScrolled: false,
    alreadyLanded: false,
    ...overrides,
  };
}

describe("decideTimelineLanding", () => {
  it("lands at the bottom for an inbox open of a running issue", () => {
    expect(decideTimelineLanding(input())).toBe("land-at-bottom");
  });

  it("keeps the top when a running issue is opened outside the inbox", () => {
    expect(decideTimelineLanding(input({ fromInbox: false }))).toBe("keep-top");
  });

  it("keeps the top for an inbox open with no active run", () => {
    expect(decideTimelineLanding(input({ hasActiveRun: false }))).toBe(
      "keep-top",
    );
  });

  it("never forces the list after the reader has scrolled", () => {
    expect(decideTimelineLanding(input({ userHasScrolled: true }))).toBe(
      "keep-top",
    );
  });

  it("lands only once per mount", () => {
    expect(decideTimelineLanding(input({ alreadyLanded: true }))).toBe(
      "keep-top",
    );
  });

  it("defers to the comment highlight landing", () => {
    expect(decideTimelineLanding(input({ hasHighlight: true }))).toBe(
      "keep-top",
    );
  });
});
