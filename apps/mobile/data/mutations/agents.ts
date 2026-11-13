/**
 * Agent mutations. Follows the project/issue optimistic-patch pattern:
 * patch the detail + both list cache variants up front, roll back on error,
 * then replace with the authoritative server row on success.
 *
 * Archive / restore change list membership (the active list excludes
 * archived agents), so those invalidate the list prefix instead of trying
 * to splice membership locally. The detail row is still replaced with the
 * server response immediately, which keeps the screen honest while the
 * list refetches.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Agent, UpdateAgentRequest } from "@multica/core/types";
import { api } from "@/data/api";
import { agentKeys } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";

function patchAgentCaches(
  qc: ReturnType<typeof useQueryClient>,
  wsId: string | null,
  agentId: string,
  patch: object,
) {
  const detailKey = agentKeys.detail(wsId, agentId);
  const listKey = agentKeys.list(wsId, false);
  const archivedListKey = agentKeys.list(wsId, true);

  const apply = (agent: Agent): Agent => ({ ...agent, ...patch });
  qc.setQueryData<Agent>(detailKey, (old) => (old ? apply(old) : old));
  qc.setQueryData<Agent[]>(listKey, (old) =>
    old ? old.map((a) => (a.id === agentId ? apply(a) : a)) : old,
  );
  qc.setQueryData<Agent[]>(archivedListKey, (old) =>
    old ? old.map((a) => (a.id === agentId ? apply(a) : a)) : old,
  );

  return { detailKey, listKey, archivedListKey };
}

function snapshotAgentCaches(
  qc: ReturnType<typeof useQueryClient>,
  wsId: string | null,
  agentId: string,
) {
  return {
    detail: qc.getQueryData<Agent>(agentKeys.detail(wsId, agentId)),
    list: qc.getQueryData<Agent[]>(agentKeys.list(wsId, false)),
    archivedList: qc.getQueryData<Agent[]>(agentKeys.list(wsId, true)),
  };
}

function restoreAgentCaches(
  qc: ReturnType<typeof useQueryClient>,
  wsId: string | null,
  agentId: string,
  snapshot: ReturnType<typeof snapshotAgentCaches>,
) {
  qc.setQueryData(agentKeys.detail(wsId, agentId), snapshot.detail);
  qc.setQueryData(agentKeys.list(wsId, false), snapshot.list);
  qc.setQueryData(agentKeys.list(wsId, true), snapshot.archivedList);
}

export function useUpdateAgent(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["updateAgent", agentId] as const,
    mutationFn: (patch: UpdateAgentRequest) => api.updateAgent(agentId, patch),
    onMutate: async (patch) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: agentKeys.detail(wsId, agentId) }),
        qc.cancelQueries({ queryKey: agentKeys.all(wsId) }),
      ]);
      const snapshot = snapshotAgentCaches(qc, wsId, agentId);
      patchAgentCaches(qc, wsId, agentId, patch);
      return snapshot;
    },
    onError: (_error, _patch, snapshot) => {
      if (snapshot) restoreAgentCaches(qc, wsId, agentId, snapshot);
    },
    onSuccess: (server) => {
      qc.setQueryData(agentKeys.detail(wsId, agentId), server);
      patchAgentCaches(qc, wsId, agentId, server);
    },
  });
}

export function useArchiveAgent(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["archiveAgent", agentId] as const,
    mutationFn: () => api.archiveAgent(agentId),
    onSuccess: (server) => {
      qc.setQueryData(agentKeys.detail(wsId, agentId), server);
      void qc.invalidateQueries({ queryKey: agentKeys.all(wsId) });
      void qc.invalidateQueries({ queryKey: agentKeys.tasks(wsId, agentId) });
    },
  });
}

export function useRestoreAgent(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["restoreAgent", agentId] as const,
    mutationFn: () => api.restoreAgent(agentId),
    onSuccess: (server) => {
      qc.setQueryData(agentKeys.detail(wsId, agentId), server);
      void qc.invalidateQueries({ queryKey: agentKeys.all(wsId) });
    },
  });
}

export function useCancelAgentTasks(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["cancelAgentTasks", agentId] as const,
    mutationFn: () => api.cancelAgentTasks(agentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.tasks(wsId, agentId) });
      void qc.invalidateQueries({ queryKey: agentKeys.tasksAll(wsId) });
      void qc.invalidateQueries({ queryKey: ["agent-task-snapshot", wsId] });
    },
  });
}

