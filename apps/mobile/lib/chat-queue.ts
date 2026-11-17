/**
 * Queue / steer gating for the queue rows.
 *
 * A queued task can only take over the session once the head task is
 * actually executing. While the head is still `queued` (server hasn't
 * claimed it yet) there is nothing to interrupt, and the prioritize call
 * would 409.
 *
 * Sending while a turn runs needs no choice: the message is always queued,
 * and steering is a queue-row action.
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
