import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";

export const agentKeys = {
  /** Prefix shared by the list and every detail query. */
  all: (wsId: string | null) => ["agents", wsId] as const,
  list: (wsId: string | null, includeArchived: boolean) =>
    includeArchived
      ? (["agents", wsId, { includeArchived: true }] as const)
      : (["agents", wsId] as const),
  detail: (wsId: string | null, agentId: string) =>
    ["agents", wsId, "detail", agentId] as const,
  tasks: (wsId: string | null, agentId: string) =>
    ["agent-tasks", wsId, agentId] as const,
  tasksAll: (wsId: string | null) => ["agent-tasks", wsId] as const,
};

export const agentListOptions = (wsId: string | null, opts?: { includeArchived?: boolean }) =>
  queryOptions({
    queryKey: agentKeys.list(wsId, !!opts?.includeArchived),
    queryFn: ({ signal }) => api.listAgents({ signal, includeArchived: opts?.includeArchived }),
    enabled: !!wsId,
    // Mirrors Web/Desktop: projected unstable ages offline without an event,
    // while offline recovery is covered by lifecycle events and reconnect.
    refetchInterval: (query) =>
      query.state.data?.some(
        (agent) =>
          !agent.archived_at &&
          (agent.runtime_availability === "online" ||
            agent.runtime_availability === "unstable"),
      )
        ? 30_000
        : false,
  });

export const agentDetailOptions = (wsId: string | null, agentId: string) =>
  queryOptions({
    queryKey: agentKeys.detail(wsId, agentId),
    queryFn: ({ signal }) => api.getAgent(agentId, { signal }),
    enabled: !!wsId && !!agentId,
    // The Agents screen is a live operations view: foregrounding should
    // re-read presence-adjacent fields even when the list is still fresh.
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

export const agentTasksOptions = (
  wsId: string | null,
  agentId: string,
  opts?: { limit?: number },
) =>
  queryOptions({
    queryKey: [...agentKeys.tasks(wsId, agentId), opts?.limit ?? 50] as const,
    queryFn: ({ signal }) =>
      api.listAgentTasks(agentId, { signal, limit: opts?.limit }),
    enabled: !!wsId && !!agentId,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
