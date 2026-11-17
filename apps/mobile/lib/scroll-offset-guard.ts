/**
 * Guards for a long list's scroll offset when something other than the
 * reader changes the list's geometry.
 *
 * Two independent things can move a list without the reader asking:
 *
 *   1. The viewport resizes — the keyboard slides away when a header button
 *      takes focus, a formSheet is dismissed, the offline strip appears.
 *      FlashList's maintain-visible-content-position re-anchors content on a
 *      resize, which can snap a scrolled list back to the top.
 *   2. The list is remounted (a key change, a cache that momentarily empties
 *      and refills). A fresh native scroll view always starts at offset 0,
 *      so the first `onScroll` reports 0 and would overwrite the offset we
 *      meant to restore.
 *
 * Both predicates are deliberately pure so the decision can be unit tested
 * without a native scroll view.
 */

/** Ignore sub-pixel / rounding-only layout churn. */
export const VIEWPORT_CHANGE_EPSILON = 0.5;

export function viewportChanged(
  previousHeight: number,
  nextHeight: number,
): boolean {
  if (previousHeight <= 0) return false;
  return Math.abs(nextHeight - previousHeight) > VIEWPORT_CHANGE_EPSILON;
}

/**
 * Should the recorded offset be re-applied after a viewport resize?
 *
 * Never while the reader is dragging (their finger owns the position), and
 * never while a deep-link landing is still settling (that path deliberately
 * scrolls to its own target).
 */
export function shouldRestoreOffsetAfterResize({
  savedOffset,
  userInteracting,
  hasDeepLinkTarget,
}: {
  savedOffset: number;
  userInteracting: boolean;
  hasDeepLinkTarget: boolean;
}): boolean {
  if (userInteracting || hasDeepLinkTarget) return false;
  return savedOffset > 0;
}

/**
 * Which offset should a resize restore to?
 *
 * Every scroll the reader's finger produced counts — the drag AND the
 * momentum that follows it — so the saved value tracks where they actually
 * stopped rather than where they lifted their finger. Only our own
 * programmatic restores are excluded (`restoring`), because recording those
 * would make the current position ratify itself.
 *
 * Negative offsets (pull-to-refresh overscroll) clamp to 0.
 */
export function recordedUserOffset(
  current: number,
  offsetY: number,
  { restoring }: { restoring: boolean },
): number {
  if (restoring) return current;
  return offsetY > 0 ? offsetY : 0;
}

/** One scroll event moving at least this far is a re-anchor, not a gesture. */
export const UNINTENDED_TOP_JUMP_PX = 200;

/** Minimum upward movement, inside a header-action window, that counts as a
 *  reset rather than the reader. Sub-pixel noise must not trigger a restore. */
export const HEADER_ACTION_RESET_EPSILON_PX = 2;

/**
 * Should an offset be restored while a header action is in flight?
 *
 * `shouldRecoverFromUnintendedTop` above only recognises a *single* large
 * jump that ends at zero, which is the shape of a snap. iOS can also unwind
 * the offset in a handful of small animated steps while it presents the
 * action sheet; each step is below that threshold, and each one used to be
 * written into the saved offset — so the saved value walked down to zero and
 * every later restore became a no-op. The list then simply stayed at the top.
 *
 * During the short window that starts when the header button is pressed, any
 * upward movement that no finger produced is therefore a reset, whatever its
 * size or shape. Outside that window the original, narrower predicate still
 * governs, so a status-bar tap-to-top keeps working.
 */
export function shouldRestoreOffsetDuringHeaderAction({
  savedOffset,
  offsetY,
  userInteracting,
  restoring,
  guarding,
}: {
  savedOffset: number;
  offsetY: number;
  userInteracting: boolean;
  restoring: boolean;
  guarding: boolean;
}): boolean {
  if (!guarding || restoring || userInteracting) return false;
  if (savedOffset <= 1) return false;
  return offsetY < savedOffset - HEADER_ACTION_RESET_EPSILON_PX;
}

/**
 * Did the list jump to the top without the reader asking?
 *
 * The backstop for every re-anchor we do not have an event for: a presented
 * ActionSheet, a native list detach, a platform quirk. The signature is a
 * single large upward jump that ends at zero while nothing user-driven is in
 * flight. Small deltas are ignored here on purpose; a reset that unwinds in
 * several small steps is covered by `shouldRestoreOffsetDuringHeaderAction`
 * instead. The timeline disables iOS's own `scrollsToTop` gesture, so no
 * system "scroll to top" can be mistaken for a reset.
 */
export function shouldRecoverFromUnintendedTop({
  savedOffset,
  previousOffsetY,
  offsetY,
  userInteracting,
  restoring,
}: {
  savedOffset: number;
  previousOffsetY: number;
  offsetY: number;
  userInteracting: boolean;
  restoring: boolean;
}): boolean {
  if (restoring || userInteracting) return false;
  if (savedOffset <= 1 || offsetY > 1) return false;
  return previousOffsetY - offsetY >= UNINTENDED_TOP_JUMP_PX;
}

/**
 * Is the bottom of the content visible?
 *
 * Computed from real geometry on every scroll/layout pass — never from a
 * hard-coded initial `true`, which would claim "at the bottom" before the
 * list has been measured and skip restores that were actually needed.
 * Content shorter than the viewport (or not measured yet) counts as bottom
 * only once the viewport exists.
 */
export function isAtBottomFromMetrics(
  {
    contentHeight,
    offsetY,
    viewportHeight,
  }: { contentHeight: number; offsetY: number; viewportHeight: number },
  slack: number = 80,
): boolean {
  if (viewportHeight <= 0) return false;
  if (contentHeight <= viewportHeight) return true;
  return contentHeight - (offsetY + viewportHeight) <= slack;
}

/**
 * Should returning to the screen re-apply the reader's offset?
 *
 * A sheet presented over the timeline (the runs list, the issue menu) can
 * detach the native list; on dismissal the scroll view may come back at
 * offset 0 even though the JS state — and therefore `savedOffset` — is
 * intact. The reader never asked to move, so put them back.
 *
 * A reader who was at the bottom is restored to the bottom rather than to a
 * stale pixel offset (see the caller), so "at bottom" is not an exclusion:
 * the same native detach that zeroes a mid-list offset also zeroes one that
 * was pinned to the end, and that reader has the strongest reason to
 * complain — they lose the newest row they were reading.
 */
export function shouldRestoreOffsetOnRefocus({
  savedOffset,
}: {
  savedOffset: number;
}): boolean {
  return savedOffset > 1;
}
