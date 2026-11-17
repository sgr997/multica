import { queryOptions } from "@tanstack/react-query";
import { api } from "@/data/api";

export const skillKeys = {
  all: (wsId: string | null) => ["skills", wsId] as const,
  list: (wsId: string | null) => ["skills", wsId, "list"] as const,
};

/**
 * Workspace skill library. One fetch backs both the add sheet and the
 * "does this agent already have it" check; the workspace library is small
 * and paging it server-side would only add blank states.
 */
export const skillListOptions = (wsId: string | null) =>
  queryOptions({
    queryKey: skillKeys.list(wsId),
    queryFn: ({ signal }) => api.listSkills({ signal }),
    enabled: !!wsId,
    staleTime: 30_000,
  });
