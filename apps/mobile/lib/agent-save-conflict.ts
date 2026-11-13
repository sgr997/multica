/**
 * Client-side optimistic-concurrency decision for agent edits.
 *
 * The API has no If-Match / revision preconditions — `PUT /api/agents/{id}`
 * is last-write-wins and returns the updated row (including `updated_at`).
 * To avoid silently overwriting another editor we:
 *
 *   1. remember the `updated_at` the form was seeded from,
 *   2. refetch the agent immediately before saving,
 *   3. ask the user to overwrite or reload when the timestamps differ.
 *
 * Missing timestamps (older backend, unparseable fallback) proceed: refusing
 * every save on a legacy server would be worse than the documented risk.
 */
export type AgentSaveDecision = "proceed" | "conflict";

export function decideAgentSave({
  baseUpdatedAt,
  latestUpdatedAt,
  overwrite = false,
}: {
  baseUpdatedAt: string | null | undefined;
  latestUpdatedAt: string | null | undefined;
  overwrite?: boolean;
}): AgentSaveDecision {
  if (overwrite) return "proceed";
  if (!baseUpdatedAt || !latestUpdatedAt) return "proceed";
  return baseUpdatedAt === latestUpdatedAt ? "proceed" : "conflict";
}
