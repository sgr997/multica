/**
 * Squad list body embedded in the Agents tab's "Squads" segment.
 *
 * Parity with web's Squads page, adapted to one phone column:
 *   - name search is local (the API returns the workspace list in one call);
 *   - scope is All / My squads, with "mine" driven by `/api/squads/involved`
 *     (membership-based) rather than the creator — the issue's requirement;
 *   - rows show the squad identity, member count, leader with a crown, and a
 *     leader-presence summary (working / idle / offline / unstable).
 */
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import type { Squad } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import {
  SquadAvatarStack,
  SquadStatusPill,
} from "@/components/squads/squad-avatar";
import {
  involvedSquadIdsOptions,
  squadListOptions,
} from "@/data/queries/squads";
import { agentListOptions } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useWorkspacePresenceMap } from "@/lib/use-agent-presence";
import { useRefreshWithHaptics } from "@/lib/use-refresh-with-haptics";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import {
  filterSquads,
  summarizeSquadStatus,
  type SquadScope,
} from "@/lib/squads";
import { useT } from "@/lib/i18n";

const SCOPES: SquadScope[] = ["all", "mine"];

export function SquadsListBody() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { t } = useT("squads");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SquadScope>("all");

  const list = useQuery(squadListOptions(wsId));
  const involved = useQuery(involvedSquadIdsOptions(wsId));
  const { data: agents = [] } = useQuery(
    agentListOptions(wsId, { includeArchived: true }),
  );
  const { byAgent: presenceByAgent } = useWorkspacePresenceMap(wsId);
  const { refreshing, onRefresh } = useRefreshWithHaptics(async () => {
    await Promise.all([list.refetch(), involved.refetch()]);
  });

  const squads = useMemo(() => list.data ?? [], [list.data]);
  const involvedIds = useMemo(
    () => new Set(involved.data ?? []),
    [involved.data],
  );
  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  );

  const rows = useMemo(() => {
    const filtered = filterSquads(squads, { query, scope, involvedIds });
    return [...filtered].sort((a, b) => {
      const archivedA = a.archived_at ? 1 : 0;
      const archivedB = b.archived_at ? 1 : 0;
      if (archivedA !== archivedB) return archivedA - archivedB;
      return a.name.localeCompare(b.name);
    });
  }, [squads, query, scope, involvedIds]);

  const openSquad = (squad: Squad) => {
    if (!wsSlug) return;
    router.push({
      pathname: "/[workspace]/squad/[id]",
      params: { workspace: wsSlug, id: squad.id },
    });
  };

  const createSquad = () => {
    if (!wsSlug) return;
    router.push({
      pathname: "/[workspace]/squad/new",
      params: { workspace: wsSlug },
    });
  };

  const scopeCounts = {
    all: squads.length,
    mine: squads.filter((squad) => involvedIds.has(squad.id)).length,
  };

  return (
    <FlatList
      data={rows}
      keyExtractor={(squad) => squad.id}
      className="flex-1"
      keyboardShouldPersistTaps="handled"
      contentContainerClassName="pb-8"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListHeaderComponent={
        <View className="gap-3 px-4 pb-2 pt-3">
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={t("list.search_placeholder")}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <SegmentedControl
            values={SCOPES.map(
              (value) =>
                `${value === "all" ? t("list.scope_all") : t("list.scope_mine")} ${scopeCounts[value]}`,
            )}
            selectedIndex={SCOPES.indexOf(scope)}
            onChange={(event) => {
              const next = SCOPES[event.nativeEvent.selectedSegmentIndex];
              if (next) setScope(next);
            }}
            backgroundColor={theme.secondary}
            tintColor={theme.background}
            fontStyle={{ color: theme.mutedForeground, fontSize: 13 }}
            activeFontStyle={{ color: theme.foreground, fontSize: 13, fontWeight: "600" }}
          />
          <Pressable
            onPress={createSquad}
            className="flex-row items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 active:bg-secondary"
          >
            <Text className="text-sm font-medium text-brand">
              + {t("list.new_squad")}
            </Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        list.isLoading ? (
          <View className="items-center py-16">
            <ActivityIndicator />
          </View>
        ) : list.error && squads.length === 0 ? (
          <View className="gap-3 px-4 pt-8">
            <Text className="text-sm text-destructive">
              {t("list.load_failed", {
                message:
                  list.error instanceof Error
                    ? list.error.message
                    : "unknown",
              })}
            </Text>
            <Button variant="outline" onPress={() => list.refetch()}>
              <Text>{t("common:actions.retry")}</Text>
            </Button>
          </View>
        ) : (
          <View className="items-center px-6 py-16">
            <Text className="text-center text-sm text-muted-foreground">
              {squads.length === 0
                ? t("list.empty")
                : t("list.empty_filtered")}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => {
        const leader = agentsById.get(item.leader_id);
        const status = item.archived_at
          ? "archived"
          : summarizeSquadStatus(presenceByAgent.get(item.leader_id));
        const memberCount = item.member_count ?? 0;
        return (
          <Pressable
            onPress={() => openSquad(item)}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-secondary"
          >
            <SquadAvatarStack squad={item} size={32} />
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-1.5">
                <Text
                  className="shrink text-base font-medium text-foreground"
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                {item.archived_at ? (
                  <View className="rounded-full bg-muted px-1.5 py-0.5">
                    <Text className="text-[10px] text-muted-foreground">
                      {t("list.archived")}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
                {t("list.member_count", { count: memberCount })}
                {" · "}
                {leader
                  ? `👑 ${leader.name}`
                  : t("list.no_leader")}
              </Text>
            </View>
            <SquadStatusPill status={status} />
          </Pressable>
        );
      }}
      ItemSeparatorComponent={() => (
        <View className="ml-[68px] h-px bg-border" />
      )}
    />
  );
}
