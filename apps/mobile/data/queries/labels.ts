/**
 * Workspace label list. Used by the label picker on issue detail.
 *
 * Workspace-scoped key — switching workspaces flips wsId and TanStack Query
 * picks up the new workspace's labels automatically.
 */
import { queryOptions } from "@tanstack/react-query";
import type { LabelResourceType } from "@multica/core/types";
import { api } from "@/data/api";

export const labelKeys = {
  /** Prefix covering every resource-type catalog in this workspace. */
  all: (wsId: string | null) => ["labels", wsId] as const,
  list: (wsId: string | null, resourceType: LabelResourceType) =>
    ["labels", wsId, resourceType] as const,
};

export const labelListOptions = (
  wsId: string | null,
  resourceType: LabelResourceType = "issue",
) =>
  queryOptions({
    queryKey: labelKeys.list(wsId, resourceType),
    queryFn: async ({ signal }) => {
      const res = await api.listLabels({ signal, resourceType });
      return res.labels;
    },
    enabled: !!wsId,
  });
