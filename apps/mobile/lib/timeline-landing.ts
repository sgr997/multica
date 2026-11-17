/**
 * Where an issue detail's timeline should settle right after it opens.
 *
 * Opening from the inbox means "show me what happened next". If an agent is
 * still working on that issue, the next thing the reader wants is the live
 * output at the newest row, not the title card they already read in the
 * notification. Every other entry point keeps the timeline at the top.
 *
 * The decision is pure so the matrix (entry point × run state × user
 * interaction) stays testable without mounting FlashList.
 */
export interface TimelineLandingInput {
  /** This mount came from an inbox row (`from=inbox`). */
  fromInbox: boolean;
  /** The issue has at least one non-terminal agent task. */
  hasActiveRun: boolean;
  /** A comment deep link owns the scroll position for this mount. */
  hasHighlight: boolean;
  /** The reader has already dragged the list during this mount. */
  userHasScrolled: boolean;
  /** This mount has already performed its one forced landing. */
  alreadyLanded: boolean;
}

export type TimelineLandingDecision = "land-at-bottom" | "keep-top";

/**
 * Decide whether this mount still owes the inbox one landing.
 *
 * Order matters:
 *   - a landing is one-shot per mount (`alreadyLanded`), so run completion
 *     or a quick back-and-forth never yanks the reader twice;
 *   - once the reader has scrolled, the list belongs to them;
 *   - a comment deep link keeps its existing highlight landing instead;
 *   - only an inbox open of a running issue lands at the bottom.
 */
export function decideTimelineLanding(
  input: TimelineLandingInput,
): TimelineLandingDecision {
  if (input.alreadyLanded) return "keep-top";
  if (input.userHasScrolled) return "keep-top";
  if (input.hasHighlight) return "keep-top";
  if (!input.fromInbox || !input.hasActiveRun) return "keep-top";
  return "land-at-bottom";
}
