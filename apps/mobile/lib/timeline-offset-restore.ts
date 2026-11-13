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
