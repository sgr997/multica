/**
 * Squad list body embedded in the Agents tab's "Squads" segment.
 *
 * Search lives in the shared header (the same expandable field as agents),
 * so the list header starts with the summary and scope chips and never gets
 * pushed down by a permanently mounted field on every visit.
 *
 * Parity with web's Squads page, adapted to one phone column:
 *   - name search is local (the API returns the workspace list in one call);
 *   - scope is All / My squads, with "mine" driven by squad membership
 *     (member, owned leader agent, or owned member agent) rather than the
 *     creator — the issue's requirement;
 *   - rows show the squad identity, member count, leader with a crown, and a
 *     leader-presence summary (working / idle / offline / unstable).
 */
import { useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { RuntimeDevice, Squad } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SquadRow } from "@/components/squads/squad-row";
import {
  involvedSquadIdsOptions,
  squadListOptions,
} from "@/data/queries/squads";
import { agentListOptions } from "@/data/queries/agents";
import { runtimeListOptions } from "@/data/queries/runtimes";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useWorkspacePresenceMap } from "@/lib/use-agent-presence";
import { useRefreshWithHaptics } from "@/lib/use-refresh-with-haptics";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import {
  filterSquads,
  sortSquads,
  summarizeSquadStatus,
  type SquadScope,
} from "@/lib/squads";
import { useT } from "@/lib/i18n";

const SCOPES: SquadScope[] = ["all", "mine"];

export function SquadsListBody({
  query,
  onClearSearch,
}: {
  /** Owned by the screen so the header search serves both segments. */
  query: string;
  onClearSearch: () => void;
}) {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { t } = useT("squads");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const [scope, setScope] = useState<SquadScope>("all");

  const list = useQuery(squadListOptions(wsId));
  const squads = useMemo(() => list.data ?? [], [list.data]);
  const agentsQuery = useQuery(
    agentListOptions(wsId, { includeArchived: true }),
  );
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);
  const runtimesQuery = useQuery(runtimeListOptions(wsId));
  const runtimesById = useMemo(
    () =>
      new Map<string, RuntimeDevice>(
        (runtimesQuery.data ?? []).map((runtime) => [runtime.id, runtime]),
      ),
    [runtimesQuery.data],
  );
  const ownedAgentIds = useMemo(
    () =>
      new Set(
        agents
          .filter((agent) => agent.owner_id === userId)
          .map((agent) => agent.id),
      ),
    [agents, userId],
  );
  const involved = useQuery(
    involvedSquadIdsOptions(
      wsId,
      squads,
      userId,
      ownedAgentIds,
      agentsQuery.isFetched,
    ),
  );
  const { byAgent: presenceByAgent } = useWorkspacePresenceMap(wsId);
  const { refreshing, onRefresh } = useRefreshWithHaptics(async () => {
    await Promise.all([
      list.refetch(),
      agentsQuery.refetch(),
      involved.refetch(),
    ]);
  });

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
    return sortSquads(filtered, presenceByAgent);
  }, [squads, query, scope, involvedIds, presenceByAgent]);

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
  const scopeLabels: Record<SquadScope, string> = {
    all: t("list.scope_all_short"),
    mine: t("list.scope_mine_short"),
  };

  const clearFilters = () => {
    onClearSearch();
    setScope("all");
  };

  const workingCount = squads.filter(
    (squad) =>
      !squad.archived_at &&
      summarizeSquadStatus(presenceByAgent.get(squad.leader_id)) === "working",
  ).length;

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
        <View className="gap-2 px-4 pb-2 pt-2">
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {t("list.summary", {
              count: squads.length,
              working: workingCount,
              mine: scopeCounts.mine,
            })}
          </Text>
          <View className="flex-row items-center gap-1">
            {SCOPES.map((value) => (
              <ScopeChip
                key={value}
                label={scopeLabels[value]}
                count={scopeCounts[value]}
                selected={scope === value}
                onPress={() => setScope(value)}
              />
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={
        list.isLoading ? (
          <SquadListSkeleton />
        ) : list.error && squads.length === 0 ? (
          <View className="items-center gap-3 px-8 pt-16">
            <Text className="text-center text-[15px] font-medium text-foreground">
              {t("list.load_failed_title")}
            </Text>
            <Text className="text-center text-xs text-muted-foreground">
              {list.error instanceof Error
                ? list.error.message
                : t("list.load_failed_fallback")}
            </Text>
            <Button variant="outline" onPress={() => list.refetch()}>
              <Text>{t("common:actions.retry")}</Text>
            </Button>
          </View>
        ) : (
          <View className="items-center px-6 pt-16">
            <Ionicons
              name={squads.length === 0 ? "people-outline" : "search-outline"}
              size={32}
              color={theme.mutedForeground}
            />
            <Text className="mt-3 text-center text-[15px] text-muted-foreground">
              {squads.length === 0 ? t("list.empty") : t("list.empty_filtered")}
            </Text>
            <Button
              className="mt-4"
              onPress={squads.length === 0 ? createSquad : clearFilters}
            >
              <Text>
                {squads.length === 0
                  ? t("list.new_squad")
                  : t("list.clear_filters")}
              </Text>
            </Button>
          </View>
        )
      }
      ListFooterComponent={
        rows.length > 0 ? (
          <Text className="px-4 pb-2 pt-8 text-center text-[13px] text-muted-foreground">
            {t("list.end_of_list", { count: rows.length })}
          </Text>
        ) : null
      }
      ItemSeparatorComponent={() => <View className="ml-4 h-px bg-border" />}
      renderItem={({ item }) => {
        const leader = agentsById.get(item.leader_id);
        const leaderPresence = presenceByAgent.get(item.leader_id);
        const status = item.archived_at
          ? "archived"
          : summarizeSquadStatus(leaderPresence);
        const runtime = leader?.runtime_id
          ? runtimesById.get(leader.runtime_id) ?? null
          : null;
        return (
          <SquadRow
            squad={item}
            leaderName={leader?.name ?? null}
            status={status}
            workingTaskCount={leaderPresence?.runningCount ?? 0}
            runtimeName={
              runtime?.custom_name?.trim() || runtime?.name?.trim() || null
            }
            onPress={() => openSquad(item)}
          />
        );
      }}
    />
  );
}

function SquadListSkeleton() {
  return (
    <View className="gap-4 px-4 pt-4">
      {[0, 1, 2].map((index) => (
        <View key={index} className="flex-row items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-[10px]" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40" />
          </View>
        </View>
      ))}
    </View>
  );
}

function ScopeChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={
        selected
          ? "flex-row items-center gap-1 rounded-full bg-secondary px-2.5 py-1"
          : "flex-row items-center gap-1 rounded-full px-2.5 py-1 active:bg-secondary"
      }
    >
      <Text
        className={
          selected
            ? "text-[13px] font-semibold text-foreground"
            : "text-[13px] text-muted-foreground"
        }
      >
        {label}
      </Text>
      <Text className="text-[11px] text-muted-foreground">{count}</Text>
    </Pressable>
  );
}
