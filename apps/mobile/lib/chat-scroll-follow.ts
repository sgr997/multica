/**
 * Scroll-follow decisions for the chat message list.
 *
 * Chat has to keep two promises that pull in opposite directions:
 *
 *   - While the reader is pinned to the bottom, new content (an arriving
 *     reply, a growing streaming trace, a late-loading image) must stay
 *     visible.
 *   - Once the reader scrolls up into history, nothing may move the
 *     viewport under their finger. A floating "jump to latest" affordance
 *     is the only way back down.
 *
 * The state that decides this is *user intent*, not geometry: content
 * growing below the viewport also increases the distance from the bottom,
 * so treating every "not at bottom" reading as "user scrolled away" would
 * stop following the moment a reply streams in. Only a gesture that the
 * user started may change the intent; programmatic scrolls and content
 * growth must leave it alone.
 *
 * The heuristic itself is deliberately small and pure so it can be tested
 * in the Node lane (no RN dragging simulation available there).
 */

/** Pixel slack at the bottom edge, shared with the issue timeline. */
export const CHAT_BOTTOM_SLACK_PX = 80;

export interface ChatScrollMetrics {
  contentHeight: number;
  offsetY: number;
  viewportHeight: number;
}

/** Pixels of content hidden below the viewport (never negative). */
export function distanceFromBottom(metrics: ChatScrollMetrics): number {
  const distance =
    metrics.contentHeight - (metrics.offsetY + metrics.viewportHeight);
  return distance > 0 ? distance : 0;
}

/**
 * Is the reader close enough to the bottom that an incoming message can be
 * treated as "already visible"? A list shorter than its viewport counts as
 * at the bottom.
 */
export function isAtBottom(
  metrics: ChatScrollMetrics,
  slack: number = CHAT_BOTTOM_SLACK_PX,
): boolean {
  return distanceFromBottom(metrics) <= slack;
}

/**
 * Follow intent after a user gesture settles.
 *
 * Called from `onScrollEndDrag` / `onMomentumScrollEnd` — i.e. only once the
 * reader has stopped moving the list. Releasing inside the slack band
 * re-pins (the reader is looking at the newest message); releasing above it
 * unpins.
 */
export function followAfterUserScroll(
  metrics: ChatScrollMetrics,
  slack: number = CHAT_BOTTOM_SLACK_PX,
): boolean {
  return isAtBottom(metrics, slack);
}

/**
 * Should a content-size change pull the list to the newest row?
 *
 * - A message the user just sent always does: sending is an explicit
 *   request to see the conversation continue.
 * - Otherwise only while following, and never while a finger/momentum is
 *   actively moving the list (the gesture owns the offset).
 */
export function shouldAutoScrollToLatest({
  following,
  userInteracting,
  lastMessageIsUser,
}: {
  following: boolean;
  userInteracting: boolean;
  lastMessageIsUser: boolean;
}): boolean {
  if (lastMessageIsUser && !userInteracting) return true;
  return following && !userInteracting;
}
