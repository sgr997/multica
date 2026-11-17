/**
 * Add-members formSheet. Two sections (people / agents), multi-select with
 * local search, then a single submit that adds only the newly-selected
 * members (existing roster rows are not listed). Mirrors web's Add Member
 * dialog semantics; the add diff is a set operation on
 * `(member_type, member_id)`.
 */
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SectionList,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { Agent, MemberWithUser } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { squadMembersOptions } from "@/data/queries/squads";
import { agentListOptions } from "@/data/queries/agents";
import { memberListOptions } from "@/data/queries/members";
import { useAddSquadMembers } from "@/data/mutations/squads";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  diffSquadMembers,
  squadMemberKey,
  squadMemberSelection,
  type SquadMemberKey,
} from "@/lib/squads";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useT } from "@/lib/i18n";

type Row =
  | { kind: "member"; member: MemberWithUser }
  | { kind: "agent"; agent: Agent };

interface Section {
  key: "members" | "agents";
  title: string;
  data: Row[];
}

export default function AddSquadMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("squads");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SquadMemberKey[]>([]);

  const roster = useQuery(squadMembersOptions(wsId, id));
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const addMembers = useAddSquadMembers(id);

  const sections = useMemo<Section[]>(() => {
    const existing = new Set(
      (roster.data ?? []).map((member) =>
        squadMemberKey(member.member_type, member.member_id),
      ),
    );
    const q = query.trim().toLocaleLowerCase();
    const matched = (name: string) =>
      !q || name.toLocaleLowerCase().includes(q);

    const memberRows = [...members]
      .filter(
        (member) =>
          matched(member.name) &&
          !existing.has(squadMemberKey("member", member.user_id)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((member): Row => ({ kind: "member", member }));

    const agentRows = [...agents]
      .filter(
        (agent) =>
          !agent.archived_at &&
          matched(agent.name) &&
          !existing.has(squadMemberKey("agent", agent.id)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((agent): Row => ({ kind: "agent", agent }));

    return [
      { key: "members", title: t("member_picker.members_section"), data: memberRows },
      { key: "agents", title: t("member_picker.agents_section"), data: agentRows },
    ].filter((section) => section.data.length > 0) as Section[];
  }, [agents, members, query, roster.data, t]);

  const selectedKeys = useMemo(
    () => new Set(selected.map((item) => squadMemberKey(item.member_type, item.member_id))),
    [selected],
  );

  const toggle = (row: Row) => {
    const key: SquadMemberKey =
      row.kind === "member"
        ? { member_type: "member", member_id: row.member.user_id }
        : { member_type: "agent", member_id: row.agent.id };
    const idKey = squadMemberKey(key.member_type, key.member_id);
    setSelected((current) =>
      current.some(
        (item) => squadMemberKey(item.member_type, item.member_id) === idKey,
      )
        ? current.filter(
            (item) => squadMemberKey(item.member_type, item.member_id) !== idKey,
          )
        : [...current, key],
    );
  };

  const submit = () => {
    if (selected.length === 0) {
      router.back();
      return;
    }
    const existing = squadMemberSelection(roster.data ?? []);
    const { toAdd } = diffSquadMembers(existing, selected);
    addMembers.mutate(toAdd, {
      onSuccess: () => router.back(),
      onError: (error) =>
        Alert.alert(
          t("member_picker.title"),
          error instanceof Error
            ? error.message
            : t("common:states.error"),
        ),
    });
  };

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Text className="text-base font-semibold text-foreground">
          {t("member_picker.title")}
        </Text>
        <Pressable
          onPress={submit}
          disabled={addMembers.isPending}
          hitSlop={6}
          className="px-3 py-1.5 active:bg-secondary rounded-md"
        >
          <Text className="text-sm font-semibold text-primary">
            {addMembers.isPending
              ? t("common:states.saving")
              : selected.length > 0
                ? t("member_picker.done") +
                  ` (${selected.length})`
                : t("member_picker.done")}
          </Text>
        </Pressable>
      </View>

      <View className="px-4 pb-2">
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t("member_picker.search_placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {roster.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(row) =>
            row.kind === "member"
              ? `m:${row.member.user_id}`
              : `a:${row.agent.id}`
          }
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pb-8"
          renderSectionHeader={({ section }) => (
            <Text className="bg-background px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => {
            const key =
              item.kind === "member"
                ? squadMemberKey("member", item.member.user_id)
                : squadMemberKey("agent", item.agent.id);
            const checked = selectedKeys.has(key);
            return (
              <Pressable
                onPress={() => toggle(item)}
                className="flex-row items-center gap-3 px-4 py-3 active:bg-secondary"
              >
                <ActorAvatar
                  type={item.kind}
                  id={
                    item.kind === "member"
                      ? item.member.user_id
                      : item.agent.id
                  }
                  size={36}
                />
                <Text
                  className="flex-1 text-base text-foreground"
                  numberOfLines={1}
                >
                  {item.kind === "member" ? item.member.name : item.agent.name}
                </Text>
                {checked ? (
                  <Ionicons name="checkmark" size={20} color={theme.primary} />
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View className="items-center px-6 py-10">
              <Text className="text-center text-sm text-muted-foreground">
                {t("member_picker.no_matches")}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
