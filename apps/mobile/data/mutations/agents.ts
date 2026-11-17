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
import type {
  Agent,
  CreateAgentRequest,
  Label,
  RuntimeLocalSkillSummary,
  SkillSummary,
  UpdateAgentRequest,
} from "@multica/core/types";
import { api } from "@/data/api";
import { agentKeys } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  mergeAgentSkills,
  toAgentSkillSummaries,
  withRuntimeSkillEnabled,
  withSkillEnabled,
  withoutSkill,
} from "@/lib/agent-skills";
import { diffAgentLabels } from "@/lib/agent-labels";

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

export function useAddAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["addAgentSkills", agentId] as const,
    mutationFn: (skills: SkillSummary[]) =>
      api.addAgentSkills(agentId, skills.map((skill) => skill.id)),
    onMutate: async (skills) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: agentKeys.detail(wsId, agentId) }),
        qc.cancelQueries({ queryKey: agentKeys.all(wsId) }),
      ]);
      const snapshot = snapshotAgentCaches(qc, wsId, agentId);
      const current = snapshot.detail ?? qc.getQueryData<Agent>(agentKeys.detail(wsId, agentId));
      if (current) {
        patchAgentCaches(qc, wsId, agentId, {
          skills: mergeAgentSkills(current.skills, skills),
        });
      }
      return snapshot;
    },
    onError: (_error, _skills, snapshot) => {
      if (snapshot) restoreAgentCaches(qc, wsId, agentId, snapshot);
    },
    onSuccess: (server) => {
      patchAgentCaches(qc, wsId, agentId, {
        skills: toAgentSkillSummaries(server),
      });
      void qc.invalidateQueries({ queryKey: agentKeys.all(wsId) });
    },
  });
}

export function useRemoveAgentSkill(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["removeAgentSkill", agentId] as const,
    mutationFn: (skillId: string) => api.removeAgentSkill(agentId, skillId),
    onMutate: async (skillId) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: agentKeys.detail(wsId, agentId) }),
        qc.cancelQueries({ queryKey: agentKeys.all(wsId) }),
      ]);
      const snapshot = snapshotAgentCaches(qc, wsId, agentId);
      const current = qc.getQueryData<Agent>(agentKeys.detail(wsId, agentId));
      if (current) {
        patchAgentCaches(qc, wsId, agentId, {
          skills: withoutSkill(current.skills, skillId),
        });
      }
      return snapshot;
    },
    onError: (_error, _skillId, snapshot) => {
      if (snapshot) restoreAgentCaches(qc, wsId, agentId, snapshot);
    },
    onSuccess: (server) => {
      patchAgentCaches(qc, wsId, agentId, {
        skills: toAgentSkillSummaries(server),
      });
      void qc.invalidateQueries({ queryKey: agentKeys.all(wsId) });
    },
  });
}

export function useSetAgentSkillEnabled(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["setAgentSkillEnabled", agentId] as const,
    mutationFn: ({
      skillId,
      enabled,
    }: {
      skillId: string;
      enabled: boolean;
    }) => api.setAgentSkillEnabled(agentId, skillId, enabled),
    onMutate: async ({ skillId, enabled }) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: agentKeys.detail(wsId, agentId) }),
        qc.cancelQueries({ queryKey: agentKeys.all(wsId) }),
      ]);
      const snapshot = snapshotAgentCaches(qc, wsId, agentId);
      const current = qc.getQueryData<Agent>(agentKeys.detail(wsId, agentId));
      if (current) {
        patchAgentCaches(qc, wsId, agentId, {
          skills: withSkillEnabled(current.skills, skillId, enabled),
        });
      }
      return snapshot;
    },
    onError: (_error, _vars, snapshot) => {
      if (snapshot) restoreAgentCaches(qc, wsId, agentId, snapshot);
    },
    onSuccess: (server) => {
      patchAgentCaches(qc, wsId, agentId, {
        skills: toAgentSkillSummaries(server),
      });
      void qc.invalidateQueries({ queryKey: agentKeys.all(wsId) });
    },
  });
}

export function useSetAgentRuntimeSkillEnabled(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["setAgentRuntimeSkillEnabled", agentId] as const,
    mutationFn: ({
      runtimeId,
      skill,
      enabled,
    }: {
      runtimeId: string;
      skill: RuntimeLocalSkillSummary;
      enabled: boolean;
    }) => {
      if (!skill.root) throw new Error("runtime skill has no discovery root");
      return api.setAgentRuntimeSkillEnabled(agentId, {
        runtime_id: runtimeId,
        root: skill.root,
        key: skill.key,
        name: skill.name,
        plugin: skill.plugin,
        enabled,
      });
    },
    onMutate: async ({ runtimeId, skill, enabled }) => {
      await qc.cancelQueries({ queryKey: agentKeys.detail(wsId, agentId) });
      const snapshot = snapshotAgentCaches(qc, wsId, agentId);
      const current = qc.getQueryData<Agent>(agentKeys.detail(wsId, agentId));
      if (current) {
        patchAgentCaches(qc, wsId, agentId, {
          disabled_runtime_skills: withRuntimeSkillEnabled(
            current.disabled_runtime_skills,
            runtimeId,
            skill,
            enabled,
          ),
        });
      }
      return snapshot;
    },
    onError: (_error, _vars, snapshot) => {
      if (snapshot) restoreAgentCaches(qc, wsId, agentId, snapshot);
    },
    // 204: no body to consume. The WS agent:status broadcast plus this
    // invalidation reconcile the override list from the server.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.detail(wsId, agentId) });
    },
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["createAgent", wsId] as const,
    mutationFn: (data: CreateAgentRequest) => api.createAgent(data),
    onSuccess: (agent) => {
      qc.setQueryData(agentKeys.detail(wsId, agent.id), agent);
      void qc.invalidateQueries({ queryKey: agentKeys.all(wsId) });
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

/**
 * Persist a label-editor draft. The backend only exposes attach/detach, so
 * the diff runs sequentially and each response carries the authoritative
 * label list. The cache is patched optimistically first (the sheet's selection
 * and the detail block agree immediately) and rolled back on failure.
 *
 * A partially-applied diff is possible when request N fails after N-1
 * succeeded; the settle-time invalidation re-reads the server so the UI never
 * keeps showing the rolled-back snapshot over real server state.
 */
export function useSaveAgentLabels(agentId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["saveAgentLabels", agentId] as const,
    mutationFn: async ({
      current,
      next,
    }: {
      current: Label[];
      next: Label[];
    }) => {
      const diff = diffAgentLabels(current, next);
      let labels = current;
      for (const label of diff.attach) {
        labels = await api.attachAgentLabel(agentId, label.id);
      }
      for (const label of diff.detach) {
        labels = await api.detachAgentLabel(agentId, label.id);
      }
      return labels;
    },
    onMutate: async ({ next }) => {
      const key = agentKeys.labels(wsId, agentId);
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<Label[]>(key);
      qc.setQueryData<Label[]>(key, next);
      return { key, snapshot };
    },
    onError: (_error, _vars, context) => {
      if (context?.snapshot) {
        qc.setQueryData(context.key, context.snapshot);
      }
    },
    onSuccess: (labels) => {
      qc.setQueryData(agentKeys.labels(wsId, agentId), labels);
      void qc.invalidateQueries({ queryKey: agentKeys.detail(wsId, agentId) });
      void qc.invalidateQueries({ queryKey: agentKeys.all(wsId) });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: agentKeys.labels(wsId, agentId) });
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

