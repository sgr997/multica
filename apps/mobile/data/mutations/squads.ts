/**
 * Squad mutations. Squad membership is a separate API from the squad row, so
 * every member write invalidates the list preview, the roster and the
 * per-member status snapshot together. Detail/list are patched with the
 * server response first, then invalidated in the background so ordering and
 * previews settle on the server's authority.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSquadRequest,
  Squad,
  SquadMember,
  SquadMemberType,
  UpdateSquadRequest,
} from "@multica/core/types";
import { api } from "@/data/api";
import { squadKeys } from "@/data/queries/squads";
import { useWorkspaceStore } from "@/data/workspace-store";
import type { SquadMemberKey } from "@/lib/squads";

function upsertSquadInList(list: Squad[] | undefined, squad: Squad) {
  if (!list) return list;
  const exists = list.some((item) => item.id === squad.id);
  return exists
    ? list.map((item) => (item.id === squad.id ? squad : item))
    : [squad, ...list];
}

export function useCreateSquad() {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["createSquad"] as const,
    mutationFn: async ({
      input,
      members = [],
    }: {
      input: CreateSquadRequest;
      members?: SquadMemberKey[];
    }) => {
      const squad = await api.createSquad(input);
      let failedMembers = 0;
      for (const member of members) {
        if (member.member_id === squad.leader_id) continue;
        try {
          await api.addSquadMember(squad.id, {
            member_type: member.member_type,
            member_id: member.member_id,
          });
        } catch {
          failedMembers += 1;
        }
      }
      return { squad, failedMembers };
    },
    onSuccess: ({ squad }) => {
      if (!squad.id) return;
      qc.setQueryData(squadKeys.detail(wsId, squad.id), squad);
      qc.setQueryData<Squad[]>(squadKeys.list(wsId), (old) =>
        upsertSquadInList(old, squad),
      );
      void qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });
      void qc.invalidateQueries({ queryKey: squadKeys.involved(wsId) });
    },
  });
}

export function useUpdateSquad(squadId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["updateSquad", squadId] as const,
    mutationFn: (patch: UpdateSquadRequest) =>
      api.updateSquad(squadId, patch),
    onSuccess: (server) => {
      if (!server.id) return;
      qc.setQueryData(squadKeys.detail(wsId, squadId), server);
      qc.setQueryData<Squad[]>(squadKeys.list(wsId), (old) =>
        upsertSquadInList(old, server),
      );
      // A leader change can add the new leader to the roster and re-derive
      // every member's status, so refresh both.
      void qc.invalidateQueries({ queryKey: squadKeys.members(wsId, squadId) });
      void qc.invalidateQueries({
        queryKey: squadKeys.memberStatus(wsId, squadId),
      });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });
      void qc.invalidateQueries({ queryKey: squadKeys.involved(wsId) });
    },
  });
}

export function useArchiveSquad(squadId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["archiveSquad", squadId] as const,
    mutationFn: () => api.deleteSquad(squadId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: squadKeys.detail(wsId, squadId) });
      qc.removeQueries({ queryKey: squadKeys.members(wsId, squadId) });
      qc.removeQueries({ queryKey: squadKeys.memberStatus(wsId, squadId) });
      void qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });
      void qc.invalidateQueries({ queryKey: squadKeys.involved(wsId) });
    },
  });
}

export function useAddSquadMembers(squadId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["addSquadMembers", squadId] as const,
    mutationFn: (members: SquadMemberKey[]) =>
      api.addSquadMembers(
        squadId,
        members.map((member) => ({
          member_type: member.member_type,
          member_id: member.member_id,
        })),
      ),
    onSuccess: (added) => {
      qc.setQueryData<SquadMember[]>(
        squadKeys.members(wsId, squadId),
        (old) => {
          if (!old) return old;
          const existing = new Set(
            old.map((member) => `${member.member_type}:${member.member_id}`),
          );
          return [
            ...old,
            ...added.filter(
              (member) =>
                !existing.has(`${member.member_type}:${member.member_id}`),
            ),
          ];
        },
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: squadKeys.detail(wsId, squadId) });
      void qc.invalidateQueries({ queryKey: squadKeys.members(wsId, squadId) });
      void qc.invalidateQueries({
        queryKey: squadKeys.memberStatus(wsId, squadId),
      });
      void qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });
      void qc.invalidateQueries({ queryKey: squadKeys.involved(wsId) });
    },
  });
}

export function useRemoveSquadMember(squadId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["removeSquadMember", squadId] as const,
    mutationFn: (member: {
      member_type: SquadMemberType;
      member_id: string;
    }) => api.removeSquadMember(squadId, member),
    onSuccess: (_data, member) => {
      qc.setQueryData<SquadMember[]>(
        squadKeys.members(wsId, squadId),
        (old) =>
          old
            ? old.filter(
                (item) =>
                  !(
                    item.member_type === member.member_type &&
                    item.member_id === member.member_id
                  ),
              )
            : old,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: squadKeys.detail(wsId, squadId) });
      void qc.invalidateQueries({ queryKey: squadKeys.members(wsId, squadId) });
      void qc.invalidateQueries({
        queryKey: squadKeys.memberStatus(wsId, squadId),
      });
      void qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });
    },
  });
}

export function useUpdateSquadMemberRole(squadId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  return useMutation({
    mutationKey: ["updateSquadMemberRole", squadId] as const,
    mutationFn: (member: {
      member_type: SquadMemberType;
      member_id: string;
      role: string;
    }) => api.updateSquadMemberRole(squadId, member),
    onSuccess: (updated) => {
      if (!updated.id) return;
      qc.setQueryData<SquadMember[]>(
        squadKeys.members(wsId, squadId),
        (old) =>
          old
            ? old.map((item) =>
                item.member_type === updated.member_type &&
                item.member_id === updated.member_id
                  ? updated
                  : item,
              )
            : old,
      );
      void qc.invalidateQueries({ queryKey: squadKeys.detail(wsId, squadId) });
      void qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });
    },
  });
}
