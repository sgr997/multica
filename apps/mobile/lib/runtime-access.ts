import type { RuntimeDevice } from "@multica/core/types";

/**
 * Whether this member may bind an agent to `runtime`.
 *
 * Mirrors `isRuntimeUsableForUser` in packages/core/runtimes/access.ts and the
 * server's `canUseRuntimeForAgent`: an ownerless runtime is unusable, a private
 * runtime is limited to its owner plus `shared_with`, and workspace admins get
 * no implicit access. Mobile keeps a local copy because the core barrel loads
 * web-only modules; keep the truth table aligned with the core test.
 */
export function canBindRuntime(
  runtime: RuntimeDevice,
  currentUserId: string | null,
): boolean {
  if (!runtime.owner_id) return false;
  if (!currentUserId) return true;
  if (runtime.owner_id === currentUserId) return true;
  return (
    runtime.visibility === "public" ||
    (runtime.visibility === "private" &&
      (runtime.shared_with ?? []).includes(currentUserId))
  );
}

/** Runtimes this member may pick in a create form (online or offline). */
export function bindableRuntimes(
  runtimes: RuntimeDevice[],
  currentUserId: string | null,
): RuntimeDevice[] {
  return runtimes.filter((runtime) => canBindRuntime(runtime, currentUserId));
}
