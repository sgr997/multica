import { queryOptions } from "@tanstack/react-query";
import type { RuntimeLocalSkillListRequest } from "@multica/core/types";
import { api } from "@/data/api";

export const runtimeKeys = {
  all: (wsId: string | null) => ["runtimes", wsId] as const,
  list: (wsId: string | null) => ["runtimes", wsId] as const,
  localSkills: (wsId: string | null, runtimeId: string | null) =>
    ["runtimes", wsId, "local-skills", runtimeId] as const,
};

// Runtime list — workspace-scoped. Feeds the availability dimension of the
// presence dot via @multica/core/agents/derive-presence (status + last_seen_at).
// Invalidated by daemon:register / sweeper-driven status changes; see
// data/realtime/use-presence-realtime.ts.
export const runtimeListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: runtimeKeys.list(wsId),
    queryFn: ({ signal }) => api.listRuntimes({ signal }),
    enabled: !!wsId,
  });

const LOCAL_SKILL_POLL_MS = 500;
const LOCAL_SKILL_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runtime-local ("built-in") skills discovered by the daemon. POST enqueues
 * the request; GET polls until it leaves pending/running. Same 30s budget as
 * packages/core/runtimes/local-skills.ts.
 */
export const runtimeLocalSkillsOptions = (
  wsId: string | null,
  runtimeId: string | null,
) =>
  queryOptions({
    queryKey: runtimeKeys.localSkills(wsId, runtimeId),
    queryFn: async ({ signal }): Promise<RuntimeLocalSkillListRequest> => {
      const id = runtimeId as string;
      let current = await api.initiateListLocalSkills(id, { signal });
      const start = Date.now();
      while (current.status === "pending" || current.status === "running") {
        if (Date.now() - start > LOCAL_SKILL_TIMEOUT_MS) {
          throw new Error("runtime local skill discovery timed out");
        }
        await sleep(LOCAL_SKILL_POLL_MS);
        if (signal.aborted) throw new Error("runtime local skill discovery aborted");
        current = await api.getLocalSkillListRequest(id, current.id, { signal });
      }
      if (current.status === "failed" || current.status === "timeout") {
        throw new Error(current.error || "runtime local skill discovery failed");
      }
      return current;
    },
    enabled: !!wsId && !!runtimeId,
    staleTime: 30_000,
    retry: false,
  });
