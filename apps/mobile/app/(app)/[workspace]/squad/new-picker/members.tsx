/**
 * Optional member preselection for the New Squad flow. Same two-section
 * multi-select shape as the detail add-member sheet, but reads/writes the
 * draft store instead of calling the API.
 */
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { Agent, MemberWithUser } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { agentListOptions } from "@/data/queries/agents";
import { memberListOptions } from "@/data/queries/members";
import { useNewSquadDraftStore } from "@/data/stores/new-squad-draft-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { squadMemberKey, type SquadMemberKey } from "@/lib/squads";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useT } from "@/lib/i18n";

type Row =
  | { kind: "member"; member: MemberWithUser }
  | { kind: "agent"; agent: Agent };

export default function NewSquadMembersPicker() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("squads");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const draftMembers = useNewSquadDraftStore((s) => s.members);
  const setMembers = useNewSquadDraftStore((s) => s.setMembers);
  const [selected, setSelected] = useState<SquadMemberKey[]>(draftMembers);
  const [query, setQuery] = useState("");

  const { data: members = [], isLoading: membersLoading } = useQuery(
    memberListOptions(wsId),
  );
  const { data: agents = [], isLoading: agentsLoading } = useQuery(
    agentListOptions(wsId),
  );

  const sections = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const matched = (name: string) =>
      !q || name.toLocaleLowerCase().includes(q);
    const memberRows: Row[] = [...members]
      .filter((member) => matched(member.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((member) => ({ kind: "member" as const, member }));
    const agentRows: Row[] = [...agents]
      .filter((agent) => !agent.archived_at && matched(agent.name))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((agent) => ({ kind: "agent" as const, agent }));
    return [
      {
        key: "members" as const,
        title: t("member_picker.members_section"),
        data: memberRows,
      },
      {
        key: "agents" as const,
        title: t("member_picker.agents_section"),
        data: agentRows,
      },
    ].filter((section) => section.data.length > 0);
  }, [agents, members, query, t]);

  const selectedKeys = useMemo(
    () =>
      new Set(
        selected.map((item) =>
          squadMemberKey(item.member_type, item.member_id),
        ),
      ),
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
            (item) =>
              squadMemberKey(item.member_type, item.member_id) !== idKey,
          )
        : [...current, key],
    );
  };

  const done = () => {
    setMembers(selected);
    router.back();
  };

  const loading = membersLoading || agentsLoading;

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
        <Text className="text-base font-semibold text-foreground">
          {t("form.members")}
        </Text>
        <Pressable
          onPress={done}
          hitSlop={6}
          className="rounded-md px-3 py-1.5 active:bg-secondary"
        >
          <Text className="text-sm font-semibold text-primary">
            {selected.length > 0
              ? t("member_picker.done") + ` (${selected.length})`
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
      {loading ? (
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
