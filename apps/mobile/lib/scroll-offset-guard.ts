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
 * Only offsets the reader actually chose count: a scroll that happened while
 * a drag or its momentum was in flight. Layout-induced re-anchors and
 * programmatic scrolls are ignored, so a reset-to-top can never become the
 * value we restore. Returns 0 (nothing to restore) for a list the reader has
 * not scrolled.
 */
export function recordedUserOffset(
  current: number,
  offsetY: number,
  userInteracting: boolean,
): number {
  return userInteracting ? offsetY : current;
}

/**
 * Should returning to the screen re-apply the reader's offset?
 *
 * A sheet presented over the timeline (the runs list, the issue menu) can
 * detach the native list; on dismissal the scroll view may come back at
 * offset 0 even though the JS state — and therefore `savedOffset` — is
 * intact. The reader never asked to move, so put them back. Being at the
 * bottom is its own intent (stay at the newest row), and a list nobody
 * scrolled has nothing to restore.
 */
export function shouldRestoreOffsetOnRefocus({
  savedOffset,
  atBottom,
}: {
  savedOffset: number;
  atBottom: boolean;
}): boolean {
  if (atBottom) return false;
  return savedOffset > 0;
}
