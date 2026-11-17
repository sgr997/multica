/**
 * Queue / steer gating shared by the composer prompt and the queue rows.
 *
 * A queued task can only take over the session once the head task is
 * actually executing. While the head is still `queued` (server hasn't
 * claimed it yet) there is nothing to interrupt, and the prioritize call
 * would 409.
 */

export const STEERABLE_HEAD_STATUSES = [
  "dispatched",
  "running",
  "waiting_local_directory",
] as const;

export function canSteerQueuedTask(headStatus: string | undefined): boolean {
  if (!headStatus) return false;
  return (STEERABLE_HEAD_STATUSES as readonly string[]).includes(headStatus);
}

/**
 * True when a send from the composer should ask "queue or steer?".
 * `supportsQueue` is the server capability flag; older servers leave it
 * undefined and keep the plain Stop-only composer.
 */
export function shouldPromptSendMode(args: {
  isRunning: boolean;
  supportsQueue: boolean | undefined;
}): boolean {
  return args.isRunning && args.supportsQueue === true;
}
