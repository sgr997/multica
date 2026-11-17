/**
 * Direct "put the timeline back where the reader left it" request.
 *
 * The issue screen's header actions are the one place where a native
 * presentation can detach the timeline list with neither a route change nor
 * a trustworthy AppState transition: `ActionSheetIOS` is a separate
 * controller, not a pushed route, and on some iOS versions it never moves
 * the app out of `active`. Inference from scroll events alone can therefore
 * miss the reset entirely.
 *
 * The screen knows exactly when the sheet has been dismissed (the action
 * callback runs for "cancel" too), so it asks the list instead of waiting
 * for a symptom. One-shot, no state: a request with no mounted list is a
 * no-op.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
const guardListeners = new Set<Listener>();
const scrollToTopListeners = new Set<Listener>();

/** Tell the mounted timeline, if any, to re-apply the reader's offset. */
export function requestTimelineOffsetRestore(): void {
  for (const listener of listeners) listener();
}

export function subscribeTimelineOffsetRestore(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Open the "a header action is in flight" window before the presentation
 * starts.
 *
 * `requestTimelineOffsetRestore` runs when the sheet is *gone*, which is too
 * late to keep the reader from watching the list jump to the top while the
 * presentation happens — and too late to stop that jump from being recorded
 * as the reader's own position. Calling this on press lets the list treat
 * every unrequested upward move until the window closes as a reset.
 */
export function beginTimelineOffsetGuard(): void {
  for (const listener of guardListeners) listener();
}

export function subscribeTimelineOffsetGuard(
  listener: Listener,
): () => void {
  guardListeners.add(listener);
  return () => {
    guardListeners.delete(listener);
  };
}

/**
 * Explicit "take me back to the top" request, made by the reader.
 *
 * Distinct from the other two channels in purpose, not just plumbing: iOS's
 * own notch/status-bar tap-to-top (`UIScrollView.scrollsToTop`) had to be
 * turned off on this list because its hit band also swallowed taps on the
 * navigation bar's title row. This is the deliberate replacement — it only
 * ever fires from a control the reader aimed at.
 */
export function requestTimelineScrollToTop(): void {
  for (const listener of scrollToTopListeners) listener();
}

export function subscribeTimelineScrollToTop(
  listener: Listener,
): () => void {
  scrollToTopListeners.add(listener);
  return () => {
    scrollToTopListeners.delete(listener);
  };
}
