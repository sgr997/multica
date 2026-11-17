/**
 * New Squad modal. Required: name + leader agent. Description and member
 * preselection are optional. Leader/member pickers are formSheet routes
 * backed by the new-squad draft store, matching the new-issue /
 * new-project draft flow.
 *
 * On success the modal dismisses and the new detail page is pushed after
 * the dismissal animation, so the user can immediately add members or route
 * work to the squad.
 */
import { useCallback } from "react";
import {
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { AutosizeTextArea } from "@/components/ui/autosize-textarea";
import { MOBILE_PLACEHOLDER_COLOR } from "@/components/ui/input-tokens";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { agentListOptions } from "@/data/queries/agents";
import { memberListOptions } from "@/data/queries/members";
import { useCreateSquad } from "@/data/mutations/squads";
import { useNewSquadDraftStore } from "@/data/stores/new-squad-draft-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useT } from "@/lib/i18n";

export default function NewSquadScreen() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { t } = useT("squads");
  const { t: tCommon } = useT("common");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const create = useCreateSquad();

  const name = useNewSquadDraftStore((s) => s.name);
  const description = useNewSquadDraftStore((s) => s.description);
  const setName = useNewSquadDraftStore((s) => s.setName);
  const setDescription = useNewSquadDraftStore((s) => s.setDescription);
  const leaderId = useNewSquadDraftStore((s) => s.leaderId);
  const members = useNewSquadDraftStore((s) => s.members);
  const reset = useNewSquadDraftStore((s) => s.reset);

  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: workspaceMembers = [] } = useQuery(memberListOptions(wsId));
  const leader = agents.find((agent) => agent.id === leaderId);

  const dirty =
    name.length > 0 ||
    description.length > 0 ||
    !!leaderId ||
    members.length > 0;
  const canCreate = name.trim().length > 0 && !!leaderId && !create.isPending;

  const onCancel = useCallback(() => {
    if (!dirty) {
      reset();
      router.back();
      return;
    }
    Alert.alert(t("form.discard_title"), t("form.discard_message"), [
      { text: t("form.keep_editing"), style: "cancel" },
      {
        text: tCommon("actions.discard"),
        style: "destructive",
        onPress: () => {
          reset();
          router.back();
        },
      },
    ]);
  }, [dirty, reset, t, tCommon]);

  const onCreate = useCallback(() => {
    if (!canCreate || !leaderId) return;
    create.mutate(
      {
        input: {
          name: name.trim(),
          description: description.trim() || undefined,
          leader_id: leaderId,
        },
        members,
      },
      {
        onSuccess: ({ squad, failedMembers }) => {
          reset();
          if (failedMembers > 0) {
            Alert.alert(t("form.members_add_failed"));
          }
          router.back();
          InteractionManager.runAfterInteractions(() => {
            if (!wsSlug) return;
            router.push({
              pathname: "/[workspace]/squad/[id]",
              params: { workspace: wsSlug, id: squad.id },
            });
          });
        },
        onError: (error) =>
          Alert.alert(
            t("form.create_failed"),
            error instanceof Error ? error.message : tCommon("states.error"),
          ),
      },
    );
  }, [
    canCreate,
    create,
    description,
    leaderId,
    members,
    name,
    reset,
    t,
    tCommon,
    wsSlug,
  ]);

  const memberNames = members
    .map((member) =>
      member.member_type === "agent"
        ? agents.find((agent) => agent.id === member.member_id)?.name
        : workspaceMembers.find(
            (workspaceMember) => workspaceMember.user_id === member.member_id,
          )?.name,
    )
    .filter((value): value is string => !!value);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable onPress={onCancel} className="px-1 py-1">
              <Text className="text-base text-brand">
                {tCommon("actions.cancel")}
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={onCreate}
              disabled={!canCreate}
              className={canCreate ? "px-1 py-1" : "px-1 py-1 opacity-40"}
            >
              <Text className="text-base font-semibold text-brand">
                {create.isPending ? t("form.creating") : t("form.create")}
              </Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 px-4 pt-5 pb-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-1.5">
            <Text className="text-xs font-medium text-muted-foreground">
              {t("form.name")}
            </Text>
            <TextField
              value={name}
              onChangeText={setName}
              placeholder={t("form.name_placeholder")}
              maxLength={120}
              autoFocus
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-medium text-muted-foreground">
              {t("form.description")}
            </Text>
            <AutosizeTextArea
              value={description}
              onChangeText={setDescription}
              placeholder={t("form.description_placeholder")}
              placeholderTextColor={MOBILE_PLACEHOLDER_COLOR}
              minHeight={88}
              maxLength={2000}
              className="rounded-md bg-secondary/50 px-3 py-2.5 text-sm leading-5 text-foreground"
            />
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-medium text-muted-foreground">
              {t("form.leader")}
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/[workspace]/squad/new-picker/leader",
                  params: { workspace: wsSlug ?? "" },
                })
              }
              className="flex-row items-center gap-3 rounded-md bg-secondary/50 px-3 py-2.5 active:bg-secondary"
            >
              {leader ? (
                <ActorAvatar type="agent" id={leader.id} size={28} />
              ) : null}
              <Text
                className={
                  leader
                    ? "flex-1 text-base text-foreground"
                    : "flex-1 text-base text-muted-foreground"
                }
                numberOfLines={1}
              >
                {leader?.name ?? t("form.leader_placeholder")}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={theme.mutedForeground}
              />
            </Pressable>
            {!leaderId ? (
              <Text className="text-xs text-muted-foreground">
                {t("form.leader_required")}
              </Text>
            ) : null}
          </View>

          <View className="gap-1.5">
            <Text className="text-xs font-medium text-muted-foreground">
              {t("form.members")}
            </Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/[workspace]/squad/new-picker/members",
                  params: { workspace: wsSlug ?? "" },
                })
              }
              className="flex-row items-center gap-3 rounded-md bg-secondary/50 px-3 py-2.5 active:bg-secondary"
            >
              <Text
                className="flex-1 text-base text-foreground"
                numberOfLines={1}
              >
                {memberNames.length > 0
                  ? memberNames.join(", ")
                  : t("form.members_placeholder")}
              </Text>
              {members.length > 0 ? (
                <Text className="text-xs text-muted-foreground">
                  {t("form.members_count", { count: members.length })}
                </Text>
              ) : null}
              <Ionicons
                name="chevron-forward"
                size={16}
                color={theme.mutedForeground}
              />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
