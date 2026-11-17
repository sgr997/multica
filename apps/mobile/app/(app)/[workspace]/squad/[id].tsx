/**
 * Squad detail — one scrolling phone column.
 *
 * Order mirrors web's object page: identity header, member roster, then the
 * destructive actions in the toolbar menu. Member rows carry the same fields
 * as web (avatar, name, type, role, leader crown, agent status + active
 * issue). Management controls are hidden unless `canManageSquad` agrees with
 * server/internal/handler/squad.go, so a read-only visitor never sees a
 * control that would 403.
 */
import { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SquadMember,
  SquadMemberStatus,
  SquadMemberStatusValue,
} from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { TextField } from "@/components/ui/text-field";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import {
  SquadAvatar,
  SquadStatusPill,
} from "@/components/squads/squad-avatar";
import {
  squadDetailOptions,
  squadKeys,
  squadMembersOptions,
  squadMemberStatusOptions,
} from "@/data/queries/squads";
import { agentListOptions } from "@/data/queries/agents";
import { memberListOptions } from "@/data/queries/members";
import {
  useArchiveSquad,
  useRemoveSquadMember,
  useUpdateSquad,
  useUpdateSquadMemberRole,
} from "@/data/mutations/squads";
import { useSquadRealtime } from "@/data/realtime/use-squad-realtime";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { canManageSquad } from "@/lib/squads";
import { useRefreshWithHaptics } from "@/lib/use-refresh-with-haptics";
import { useT } from "@/lib/i18n";

const STATUS_VALUES = new Set<SquadMemberStatusValue>([
  "working",
  "idle",
  "offline",
  "unstable",
  "archived",
]);

function memberStatusValue(
  status: SquadMemberStatus | undefined,
): SquadMemberStatusValue | null {
  if (!status?.status) return null;
  return STATUS_VALUES.has(status.status as SquadMemberStatusValue)
    ? (status.status as SquadMemberStatusValue)
    : null;
}

export default function SquadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { t } = useT("squads");
  const { t: tCommon } = useT("common");
  const qc = useQueryClient();

  const detail = useQuery(squadDetailOptions(wsId, id));
  const roster = useQuery(squadMembersOptions(wsId, id));
  const status = useQuery(squadMemberStatusOptions(wsId, id));
  const { data: agents = [] } = useQuery(
    agentListOptions(wsId, { includeArchived: true }),
  );
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  const squad = detail.data && detail.data.id ? detail.data : null;
  const role = members.find((member) => member.user_id === userId)?.role ?? null;
  const canManage = !!squad && canManageSquad(squad, userId, role);
  const canWrite = canManage && !squad?.archived_at;

  const archive = useArchiveSquad(id);
  const removeMember = useRemoveSquadMember(id);
  const updateSquad = useUpdateSquad(id);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // The delete event can arrive before the DELETE response. When this device
  // initiated the archive, let the mutation's onSuccess own the single pop so
  // we don't dismiss two screens.
  useSquadRealtime(id, () => {
    if (!archive.isPending) router.back();
  });

  const { refreshing, onRefresh } = useRefreshWithHaptics(async () => {
    await Promise.all([
      detail.refetch(),
      roster.refetch(),
      status.refetch(),
    ]);
  });

  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  );
  const statusById = useMemo(() => {
    const map = new Map<string, SquadMemberStatus>();
    for (const entry of status.data?.members ?? []) {
      map.set(entry.member_id, entry);
    }
    return map;
  }, [status.data]);

  const memberName = (member: SquadMember) =>
    member.member_type === "agent"
      ? agentsById.get(member.member_id)?.name ??
        member.member_id.slice(0, 8)
      : membersById.get(member.member_id)?.name ??
        member.member_id.slice(0, 8);

  const openMemberActions = (member: SquadMember) => {
    if (!canWrite || !squad) return;
    const actions: ("leader" | "remove" | "cancel")[] = [];
    if (
      member.member_type === "agent" &&
      member.member_id !== squad.leader_id &&
      !agentsById.get(member.member_id)?.archived_at
    ) {
      actions.push("leader");
    }
    if (member.member_id !== squad.leader_id) actions.push("remove");
    actions.push("cancel");
    if (actions.length === 1) return;

    const options = actions.map((action) =>
      action === "leader"
        ? t("detail.set_leader")
        : action === "remove"
          ? t("detail.remove_member")
          : tCommon("actions.cancel"),
    );
    const destructiveIndex = actions.indexOf("remove");

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t("detail.member_menu", {
          name: memberName(member),
        }),
        options,
        cancelButtonIndex: actions.indexOf("cancel"),
        destructiveButtonIndex:
          destructiveIndex >= 0 ? destructiveIndex : undefined,
      },
      (index) => {
        const action = actions[index];
        if (action === "leader") {
          updateSquad.mutate(
            { leader_id: member.member_id },
            {
              onError: (error) =>
                Alert.alert(
                  t("detail.set_leader"),
                  error instanceof Error
                    ? error.message
                    : tCommon("states.error"),
                ),
            },
          );
          return;
        }
        if (action === "remove") {
          Alert.alert(
            t("detail.remove_confirm_title", {
              name: memberName(member),
            }),
            t("detail.remove_confirm_message"),
            [
              { text: tCommon("actions.cancel"), style: "cancel" },
              {
                text: t("detail.remove"),
                style: "destructive",
                onPress: () =>
                  removeMember.mutate(
                    {
                      member_type: member.member_type,
                      member_id: member.member_id,
                    },
                    {
                      onError: (error) =>
                        Alert.alert(
                          t("detail.remove_member"),
                          error instanceof Error
                            ? error.message
                            : tCommon("states.error"),
                        ),
                    },
                  ),
              },
            ],
          );
        }
      },
    );
  };

  const headerRight = () => {
    if (!canWrite || !squad || !wsSlug) return null;
    return (
      <View className="flex-row items-center">
        <IconButton
          name="pencil"
          onPress={() =>
            router.push({
              pathname: "/[workspace]/squad/[id]/edit",
              params: { workspace: wsSlug, id },
            })
          }
          accessibilityLabel={t("detail.edit")}
        />
        <IconButton
          name="ellipsis-horizontal"
          onPress={() => setArchiveOpen(true)}
          accessibilityLabel={t("detail.menu_aria")}
        />
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: squad?.name || t("navigation:routes.squad"),
          headerBackTitle: tCommon("actions.back"),
          headerRight,
        }}
      />

      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : detail.error || !squad ? (
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-center text-sm text-destructive">
            {detail.error
              ? t("detail.load_failed")
              : t("detail.not_found_description")}
          </Text>
          <Button variant="outline" onPress={() => detail.refetch()}>
            <Text>{tCommon("actions.retry")}</Text>
          </Button>
        </View>
      ) : (
        <ScrollView
          contentContainerClassName="pb-12"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View className="flex-row items-start gap-3 px-4 pt-4">
            <SquadAvatar squad={squad} size="lg" />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="shrink text-xl font-semibold text-foreground">
                  {squad.name}
                </Text>
                {squad.archived_at ? (
                  <View className="rounded-full bg-muted px-2 py-0.5">
                    <Text className="text-[10px] text-muted-foreground">
                      {t("list.archived")}
                    </Text>
                  </View>
                ) : null}
              </View>
              {squad.description ? (
                <Text className="mt-1 text-sm leading-5 text-muted-foreground">
                  {squad.description}
                </Text>
              ) : null}
            </View>
          </View>

          {squad.archived_at ? (
            <Text className="mx-4 mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {t("detail.archived_notice")}
            </Text>
          ) : null}

          <View className="mt-6 flex-row items-center justify-between px-4">
            <Text className="text-base font-semibold text-foreground">
              {t("detail.members")}
              <Text className="text-sm font-normal text-muted-foreground">
                {"  "}
                {roster.data?.length ?? 0}
              </Text>
            </Text>
            {canWrite ? (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  if (!wsSlug) return;
                  router.push({
                    pathname: "/[workspace]/squad/[id]/add-member",
                    params: { workspace: wsSlug, id },
                  });
                }}
              >
                <Text className="text-brand">+ {t("detail.add_member")}</Text>
              </Button>
            ) : null}
          </View>

          <View className="mt-2 border-t border-border">
            {roster.isLoading && !roster.data ? (
              <View className="items-center py-8">
                <ActivityIndicator />
              </View>
            ) : (roster.data ?? []).length === 0 ? (
              <Text className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t("detail.no_members")}
              </Text>
            ) : (
              (roster.data ?? []).map((member) => (
                <SquadMemberRow
                  key={member.id}
                  member={member}
                  name={memberName(member)}
                  isLeader={member.member_id === squad.leader_id}
                  canManage={canWrite}
                  status={statusById.get(member.member_id)}
                  onMenu={() => openMemberActions(member)}
                  squadId={id}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}

      {squad && archiveOpen ? (
        <ArchiveSquadModal
          squadName={squad.name}
          pending={archive.isPending}
          onCancel={() => setArchiveOpen(false)}
          onConfirm={() => {
            archive.mutate(undefined, {
              onSuccess: () => {
                setArchiveOpen(false);
                qc.invalidateQueries({ queryKey: squadKeys.list(wsId) });
                router.back();
              },
              onError: (error) => {
                setArchiveOpen(false);
                Alert.alert(
                  t("detail.archive_failed"),
                  error instanceof Error ? error.message : tCommon("states.error"),
                );
              },
            });
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function SquadMemberRow({
  member,
  name,
  isLeader,
  canManage,
  status,
  onMenu,
  squadId,
}: {
  member: SquadMember;
  name: string;
  isLeader: boolean;
  canManage: boolean;
  status: SquadMemberStatus | undefined;
  onMenu: () => void;
  squadId: string;
}) {
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { t } = useT("squads");
  const updateRole = useUpdateSquadMemberRole(squadId);

  const statusValue = memberStatusValue(status);
  const activeIssues = status?.active_issues ?? [];
  const issue = activeIssues[0];
  const extra = activeIssues.length - 1;

  const saveRole = (value: string) => {
    const next = value.trim();
    if (next === member.role.trim()) return;
    updateRole.mutate(
      {
        member_type: member.member_type,
        member_id: member.member_id,
        role: next,
      },
      {
        onError: (error) =>
          Alert.alert(
            t("detail.members"),
            error instanceof Error ? error.message : t("common:states.error"),
          ),
      },
    );
  };

  return (
    <View className="px-4 py-3">
      <View className="flex-row items-start gap-3">
        <ActorAvatar
          type={member.member_type}
          id={member.member_id}
          size={36}
          showPresence={member.member_type === "agent"}
        />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text
              className="shrink text-base font-medium text-foreground"
              numberOfLines={1}
            >
              {name}
            </Text>
            {isLeader ? <Text className="text-xs">👑</Text> : null}
            <View className="rounded-full bg-secondary px-1.5 py-0.5">
              <Text className="text-[10px] text-secondary-foreground">
                {member.member_type === "agent"
                  ? t("detail.type_agent")
                  : t("detail.type_member")}
              </Text>
            </View>
            {statusValue ? (
              <SquadStatusPill status={statusValue} className="ml-auto" />
            ) : null}
          </View>

          {canManage ? (
            <TextField
              key={`role-${member.id}-${member.role}`}
              defaultValue={member.role}
              onEndEditing={(event) => saveRole(event.nativeEvent.text)}
              placeholder={t("detail.role_placeholder")}
              returnKeyType="done"
              maxLength={80}
              className="mt-1.5 h-8 bg-transparent px-2 text-sm"
            />
          ) : member.role ? (
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {member.role}
            </Text>
          ) : null}

          {issue ? (
            <Pressable
              onPress={() => {
                if (!wsSlug) return;
                router.push({
                  pathname: "/[workspace]/issue/[id]",
                  params: { workspace: wsSlug, id: issue.issue_id },
                });
              }}
              className="mt-1 flex-row items-center gap-1 active:opacity-60"
            >
              <Text className="text-xs text-brand" numberOfLines={1}>
                {t("detail.working_on")} · {issue.identifier} {issue.title}
              </Text>
              {extra > 0 ? (
                <Text className="text-xs text-muted-foreground">
                  {t("detail.and_more", { count: extra })}
                </Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>

        {canManage && !isLeader ? (
          <IconButton
            name="ellipsis-horizontal"
            iconSize={18}
            onPress={onMenu}
            accessibilityLabel={t("detail.member_menu", { name })}
          />
        ) : null}
      </View>
    </View>
  );
}

function ArchiveSquadModal({
  squadName,
  pending,
  onCancel,
  onConfirm,
}: {
  squadName: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // A custom modal instead of Alert.prompt: the confirm button must stay
  // disabled until the typed name matches, which Alert.prompt cannot express
  // (it only validates after the user taps the action).
  const { t } = useT("squads");
  const { t: tCommon } = useT("common");
  const [value, setValue] = useState("");

  const matches = value.trim() === squadName.trim();

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 items-center justify-center bg-black/40 px-6"
      >
        <View className="w-full gap-3 rounded-2xl bg-background p-5">
          <Text className="text-lg font-semibold text-foreground">
            {t("detail.archive_title")}
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {t("detail.archive_message")}
          </Text>
          <TextField
            autoFocus
            value={value}
            onChangeText={setValue}
            placeholder={t("detail.archive_type_hint")}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View className="mt-1 flex-row justify-end gap-2">
            <Button variant="outline" size="sm" onPress={onCancel}>
              <Text>{t("detail.archive_cancel")}</Text>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!matches || pending}
              onPress={onConfirm}
            >
              <Text>
                {pending
                  ? tCommon("states.saving")
                  : t("detail.archive_confirm")}
              </Text>
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
