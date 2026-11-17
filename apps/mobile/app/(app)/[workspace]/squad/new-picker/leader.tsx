/**
 * Leader picker for the New Squad flow. Single-select over non-archived
 * workspace agents; writes to the cross-route draft store and dismisses.
 */
import { useMemo, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { agentListOptions } from "@/data/queries/agents";
import { useNewSquadDraftStore } from "@/data/stores/new-squad-draft-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useT } from "@/lib/i18n";

export default function NewSquadLeaderPicker() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("squads");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const leaderId = useNewSquadDraftStore((s) => s.leaderId);
  const setLeaderId = useNewSquadDraftStore((s) => s.setLeaderId);
  const [query, setQuery] = useState("");
  const { data: agents = [], isLoading } = useQuery(agentListOptions(wsId));

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return [...agents]
      .filter(
        (agent) =>
          !agent.archived_at &&
          (!q || agent.name.toLocaleLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, query]);

  return (
    <View className="flex-1">
      <View className="px-4 pb-2 pt-4">
        <Text className="mb-2 text-base font-semibold text-foreground">
          {t("leader_picker.title")}
        </Text>
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t("leader_picker.search_placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(agent) => agent.id}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-8"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setLeaderId(item.id);
              router.back();
            }}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-secondary"
          >
            <ActorAvatar type="agent" id={item.id} size={36} />
            <Text className="flex-1 text-base text-foreground" numberOfLines={1}>
              {item.name}
            </Text>
            {leaderId === item.id ? (
              <Ionicons name="checkmark" size={20} color={theme.primary} />
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="items-center px-6 py-10">
            <Text className="text-center text-sm text-muted-foreground">
              {isLoading
                ? t("common:states.loading")
                : t("leader_picker.no_matches")}
            </Text>
          </View>
        }
      />
    </View>
  );
}
