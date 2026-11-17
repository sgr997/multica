/**
 * Squad detail — one scrolling phone column.
 *
 * Chrome: a plain 44pt toolbar (back chevron, centered title, two independent
 * icon buttons). The native iOS 26 header groups bar buttons into a shared
 * glass capsule, which competed with the title; hiding it also removes the
 * duplicate in-content title.
 *
 * Body: 56pt identity tile, a description capped at three lines, then the
 * roster. Every member row is two lines — name/crown/menu, then role pill and
 * dot status on one baseline — so leaders and regular members scan alike.
 *
 * Management controls are hidden unless `canManageSquad` agrees with
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
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  SquadMember,
  SquadMemberStatus,
} from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { TextField } from "@/components/ui/text-field";
import { SquadAvatar } from "@/components/squads/squad-avatar";
import {
  SquadMemberRow,
  squadMemberRoleLabel,
} from "@/components/squads/squad-member-row";
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
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useT } from "@/lib/i18n";

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
  const updateRole = useUpdateSquadMemberRole(id);
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

  const promptRole = (member: SquadMember) => {
    if (!canWrite) return;
    Alert.prompt(
      t("detail.role_edit_title"),
      t("detail.role_edit_message", { name: memberName(member) }),
      (value?: string) => {
        if (value === undefined) return;
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
                t("detail.role_edit_title"),
                error instanceof Error
                  ? error.message
                  : tCommon("states.error"),
              ),
          },
        );
      },
      "plain-text",
      member.role,
    );
  };

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

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else if (wsSlug) {
      router.replace(`/${wsSlug}/agents`);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerShown: false,
          gestureEnabled: true,
        }}
      />
      <SquadDetailHeader
        title={squad?.name || t("navigation:routes.squad")}
        onBack={goBack}
        onEdit={
          canWrite && wsSlug
            ? () =>
                router.push({
                  pathname: "/[workspace]/squad/[id]/edit",
                  params: { workspace: wsSlug, id },
                })
            : undefined
        }
        onMenu={canWrite ? () => setArchiveOpen(true) : undefined}
      />

      <SafeAreaView edges={["bottom"]} className="flex-1">
        {detail.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : detail.error || !squad ? (
          <View className="flex-1 items-center justify-center gap-3 px-6">
            <Text className="text-center text-[15px] text-destructive">
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
            <View className="px-4 pt-4">
              <View className="flex-row items-center gap-2">
                <SquadAvatar squad={squad} size="lg" />
                {squad.archived_at ? (
                  <View className="rounded-full bg-muted px-2 py-0.5">
                    <Text className="text-[11px] text-muted-foreground">
                      {t("list.archived")}
                    </Text>
                  </View>
                ) : null}
              </View>
              {squad.description ? (
                <Text
                  className="mt-3 text-[15px] leading-5 text-muted-foreground"
                  numberOfLines={3}
                >
                  {squad.description}
                </Text>
              ) : null}
              {squad.archived_at ? (
                <Text className="mt-3 text-[13px] text-muted-foreground">
                  {t("detail.archived_notice")}
                </Text>
              ) : null}
            </View>

            <View className="mt-6 flex-row items-center justify-between px-4">
              <View className="flex-row items-baseline gap-1.5">
                <Text className="text-[17px] font-semibold text-foreground">
                  {t("detail.members")}
                </Text>
                <Text className="text-[13px] text-muted-foreground">
                  {roster.data?.length ?? 0}
                </Text>
              </View>
              {canWrite ? (
                <Pressable
                  onPress={() => {
                    if (!wsSlug) return;
                    router.push({
                      pathname: "/[workspace]/squad/[id]/add-member",
                      params: { workspace: wsSlug, id },
                    });
                  }}
                  accessibilityRole="button"
                  className="h-11 justify-center active:opacity-60"
                >
                  <Text className="text-[13px] font-medium text-brand">
                    + {t("detail.add_member")}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View className="mt-1">
              <View className="ml-4 h-px bg-border" />
              {roster.isLoading && !roster.data ? (
                <View className="items-center py-8">
                  <ActivityIndicator />
                </View>
              ) : (roster.data ?? []).length === 0 ? (
                <Text className="px-4 py-8 text-center text-[15px] text-muted-foreground">
                  {t("detail.no_members")}
                </Text>
              ) : (
                (roster.data ?? []).map((member, index, all) => {
                  const isLeader = member.member_id === squad.leader_id;
                  const memberStatus = statusById.get(member.member_id);
                  const issue = memberStatus?.active_issues?.[0];
                  return (
                    <View key={member.id}>
                      <SquadMemberRow
                        member={member}
                        name={memberName(member)}
                        isLeader={isLeader}
                        roleLabel={squadMemberRoleLabel(
                          isLeader,
                          member.role,
                          t("detail.role_leader"),
                          canWrite ? t("detail.role_placeholder") : "",
                        )}
                        status={memberStatus?.status}
                        canManage={canWrite}
                        onMenu={
                          canWrite && !isLeader
                            ? () => openMemberActions(member)
                            : undefined
                        }
                        onPressRole={
                          canWrite ? () => promptRole(member) : undefined
                        }
                        activeIssue={
                          issue
                            ? {
                                identifier: issue.identifier,
                                title: issue.title,
                                extra:
                                  (memberStatus?.active_issues.length ?? 1) - 1,
                              }
                            : null
                        }
                        onPressIssue={
                          issue && wsSlug
                            ? () =>
                                router.push({
                                  pathname: "/[workspace]/issue/[id]",
                                  params: {
                                    workspace: wsSlug,
                                    id: issue.issue_id,
                                  },
                                })
                            : undefined
                        }
                      />
                      {index < all.length - 1 ? (
                        <View className="ml-4 h-px bg-border" />
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>
        )}
      </SafeAreaView>

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
    </View>
  );
}

/**
 * Plain toolbar. iOS 26 wraps native bar-button groups in a shared glass
 * capsule; drawing the row here keeps the back chevron and the two actions
 * independent while the stack still owns the swipe-back gesture.
 */
function SquadDetailHeader({
  title,
  onBack,
  onEdit,
  onMenu,
}: {
  title: string;
  onBack: () => void;
  onEdit?: () => void;
  onMenu?: () => void;
}) {
  const { t } = useT("squads");
  const { t: tCommon } = useT("common");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const hasActions = !!onEdit && !!onMenu;

  return (
    <SafeAreaView
      edges={["top"]}
      className="border-b border-border bg-background"
    >
      <View className="relative h-11 justify-center">
        <Text
          className="mx-[88px] text-center text-[17px] font-semibold text-foreground"
          numberOfLines={1}
        >
          {title}
        </Text>
        <View
          className="flex-row items-center"
          style={{ position: "absolute", left: 0, top: 0, bottom: 0 }}
        >
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={tCommon("actions.back")}
            className="h-11 w-11 items-center justify-center active:opacity-60"
          >
            <Ionicons name="chevron-back" size={26} color={theme.foreground} />
          </Pressable>
        </View>
        {hasActions ? (
          <View
            className="flex-row items-center"
            style={{ position: "absolute", right: 0, top: 0, bottom: 0 }}
          >
            <IconButton
              name="pencil"
              iconSize={20}
              onPress={onEdit}
              className="h-11 w-11"
              accessibilityLabel={t("detail.edit")}
            />
            <IconButton
              name="ellipsis-horizontal"
              iconSize={20}
              onPress={onMenu}
              className="h-11 w-11"
              accessibilityLabel={t("detail.menu_aria")}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
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
          <Text className="text-[17px] font-semibold text-foreground">
            {t("detail.archive_title")}
          </Text>
          <Text className="text-[15px] leading-5 text-muted-foreground">
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
