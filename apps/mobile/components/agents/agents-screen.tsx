/**
 * Workspace collaboration tab — agents and squads as one page.
 *
 * The page answers, in order: is any queued work blocked, who is running,
 * who is available, then the full roster. Agents and squads stay separate
 * views behind the same persisted segment control, mounted together so
 * switching never loses scroll position or an in-flight refresh.
 *
 * `include_archived=true` is always requested; the archived toggle is a
 * client filter so opening it never triggers a second network round-trip.
 */
import { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  RefreshControl,
  SectionList,
  View,
} from "react-native";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, AgentTask } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/ui/header";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import { AgentRow, agentRuntimeLabel } from "@/components/agents/agent-row";
import { AgentsSegment } from "@/components/agents/agents-segment";
import { CollaborationStatusCard } from "@/components/agents/collaboration-status-card";
import { CollaborationSummaryRow } from "@/components/agents/collaboration-summary-row";
import { SquadsListBody } from "@/components/squads/squads-list-body";
import { agentListOptions } from "@/data/queries/agents";
import { agentTaskSnapshotOptions } from "@/data/queries/agent-task-snapshot";
import { runtimeListOptions } from "@/data/queries/runtimes";
import { api } from "@/data/api";
import {
  useAgentsTabStore,
  type AgentsTabSegment,
} from "@/data/stores/agents-tab-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useWorkspacePresenceMap } from "@/lib/use-agent-presence";
import {
  collectAttention,
  groupAgents,
  summarizeAgents,
  type AgentSectionKey,
} from "@/lib/agent-list";
import { useRefreshWithHaptics } from "@/lib/use-refresh-with-haptics";
import { useT } from "@/lib/i18n";

interface AgentSectionData {
  key: AgentSectionKey;
  data: Agent[];
}

export function AgentsScreen() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { t } = useT("agents");
  const segment = useAgentsTabStore((s) => s.segment);
  const setSegment = useAgentsTabStore((s) => s.setSegment);
  const queryClient = useQueryClient();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const agentsQuery = useQuery(
    agentListOptions(wsId, { includeArchived: true }),
  );
  const agents = useMemo(() => agentsQuery.data ?? [], [agentsQuery.data]);
  const runtimesQuery = useQuery(runtimeListOptions(wsId));
  const runtimes = useMemo(
    () => runtimesQuery.data ?? [],
    [runtimesQuery.data],
  );
  const tasksQuery = useQuery(agentTaskSnapshotOptions(wsId));
  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const { byAgent: presenceByAgent } = useWorkspacePresenceMap(wsId);
  const { refreshing, onRefresh } = useRefreshWithHaptics(() =>
    Promise.all([
      agentsQuery.refetch(),
      runtimesQuery.refetch(),
      tasksQuery.refetch(),
    ]),
  );

  const runtimesById = useMemo(
    () => new Map(runtimes.map((runtime) => [runtime.id, runtime])),
    [runtimes],
  );

  const sections = useMemo<AgentSectionData[]>(
    () =>
      groupAgents(agents, presenceByAgent, {
        query,
        runtimeId,
        showArchived,
      }).map((section) => ({ key: section.key, data: section.agents })),
    [agents, presenceByAgent, query, runtimeId, showArchived],
  );

  const summary = useMemo(
    () => summarizeAgents(agents, presenceByAgent),
    [agents, presenceByAgent],
  );
  const attention = useMemo(
    () => collectAttention(agents, tasks, presenceByAgent),
    [agents, tasks, presenceByAgent],
  );
  const runtimeHealth = useMemo(() => {
    // A failed runtime query must not read as "0/0 online".
    if (runtimesQuery.isError && runtimes.length === 0) return null;
    return {
      online: runtimes.filter((runtime) => runtime.status === "online").length,
      total: runtimes.length,
    };
  }, [runtimes, runtimesQuery.isError]);

  const openAgent = (id: string) => {
    if (!wsSlug) return;
    router.push({
      pathname: "/[workspace]/agent/[id]",
      params: { workspace: wsSlug, id },
    });
  };

  const openAttention = () => {
    if (attention.length === 1) {
      openAgent(attention[0].agent.id);
      return;
    }
    const cancelIndex = attention.length;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t("attention.choose_agent"),
        options: [
          ...attention.map((entry) => entry.agent.name),
          t("common:actions.cancel"),
        ],
        cancelButtonIndex: cancelIndex,
      },
      (index) => {
        if (index === cancelIndex) return;
        const entry = attention[index];
        if (entry) openAgent(entry.agent.id);
      },
    );
  };

  const refreshActionCaches = () => {
    void queryClient.invalidateQueries({ queryKey: ["agent-task-snapshot", wsId] });
    void queryClient.invalidateQueries({ queryKey: ["agents", wsId] });
    void queryClient.invalidateQueries({ queryKey: ["agent-tasks", wsId] });
  };

  const retryBlockedTasks = async () => {
    const pending = attention.flatMap((entry) =>
      entry.tasks.filter((task) => task.issue_id),
    );
    if (pending.length === 0) {
      Alert.alert(t("attention.retry_empty_title"), t("attention.retry_empty_message"));
      return;
    }
    setActionBusy(true);
    try {
      await Promise.all(
        pending.map((task: AgentTask) =>
          api.rerunIssue(task.issue_id, task.id),
        ),
      );
      refreshActionCaches();
      Alert.alert(
        t("attention.retry_done_title"),
        t("attention.retry_done_message", { count: pending.length }),
      );
    } catch (error) {
      Alert.alert(
        t("attention.retry_failed_title"),
        error instanceof Error ? error.message : t("attention.unknown_error"),
      );
    } finally {
      setActionBusy(false);
    }
  };

  const cancelBlockedTasks = () => {
    const total = attention.reduce((sum, entry) => sum + entry.count, 0);
    Alert.alert(
      t("attention.cancel_title"),
      t("attention.cancel_message", { count: total }),
      [
        { text: t("common:actions.cancel"), style: "cancel" },
        {
          text: t("attention.cancel_confirm"),
          style: "destructive",
          onPress: async () => {
            setActionBusy(true);
            try {
              await Promise.all(
                attention.map((entry) =>
                  api.cancelAgentTasks(entry.agent.id),
                ),
              );
              refreshActionCaches();
            } catch (error) {
              Alert.alert(
                t("attention.cancel_failed_title"),
                error instanceof Error ? error.message : t("attention.unknown_error"),
              );
            } finally {
              setActionBusy(false);
            }
          },
        },
      ],
    );
  };

  const openCreateAgent = () => {
    if (!wsSlug) return;
    router.push({
      pathname: "/[workspace]/agent/new",
      params: { workspace: wsSlug },
    });
  };

  const openCreateSquad = () => {
    if (!wsSlug) return;
    router.push({
      pathname: "/[workspace]/squad/new",
      params: { workspace: wsSlug },
    });
  };

  const openFilter = () => {
    const actions: string[] = [t("list.all_runtimes")];
    for (const runtime of runtimes) {
      actions.push(agentRuntimeLabel(runtime) || runtime.provider);
    }
    actions.push(
      showArchived ? t("list.hide_archived") : t("list.show_archived"),
    );
    actions.push(t("common:actions.cancel"));
    const archivedIndex = actions.length - 2;
    const cancelIndex = actions.length - 1;

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t("list.filter_title"),
        options: actions,
        cancelButtonIndex: cancelIndex,
      },
      (index) => {
        if (index === cancelIndex) return;
        if (index === archivedIndex) {
          setShowArchived((value) => !value);
          return;
        }
        if (index === 0) {
          setRuntimeId(null);
          return;
        }
        setRuntimeId(runtimes[index - 1]?.id ?? null);
      },
    );
  };

  const toggleSearch = () => {
    if (searchOpen) {
      setQuery("");
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
  };

  const clearFilters = () => {
    setQuery("");
    setRuntimeId(null);
    setShowArchived(false);
  };

  const changeSegment = (next: AgentsTabSegment) => {
    if (next === segment) return;
    setSearchOpen(false);
    setQuery("");
    setSegment(next);
  };

  const showSkeleton = agentsQuery.isLoading && agents.length === 0;
  const showError = !!agentsQuery.error && agents.length === 0;

  return (
    <View className="flex-1 bg-background">
      <Header
        title={t("header.title")}
        right={
          <>
            <IconButton
              name="add"
              onPress={segment === "squads" ? openCreateSquad : openCreateAgent}
              accessibilityLabel={
                segment === "squads"
                  ? t("squads:list.new_squad")
                  : t("create.new_aria")
              }
            />
            <IconButton
              name="search"
              onPress={toggleSearch}
              accessibilityLabel={t("common:actions.search")}
            />
            {segment === "agents" ? (
              <IconButton
                name="ellipsis-horizontal-circle"
                onPress={openFilter}
                accessibilityLabel={t("list.filter_title")}
              />
            ) : null}
          </>
        }
      />

      <View className="px-4 pb-2 pt-1" style={{ alignItems: "flex-start" }}>
        <AgentsSegment value={segment} onChange={changeSegment} />
      </View>

      {searchOpen ? (
        <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
          <TextField
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={
              segment === "squads"
                ? t("squads:list.search_placeholder")
                : t("list.search_placeholder")
            }
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1"
          />
          <Button variant="ghost" size="sm" onPress={toggleSearch}>
            <Text>{t("common:actions.cancel")}</Text>
          </Button>
        </View>
      ) : null}

      {/* Both segments stay mounted and are hidden with `display` instead of
          unmounting: switching segments must not reset the other list's
          scroll position or in-flight refresh. */}
      <View
        className="flex-1"
        style={{ display: segment === "agents" ? "flex" : "none" }}
      >
        <View className="pt-1">
          <CollaborationSummaryRow summary={summary} runtimes={runtimeHealth} />
        </View>
        <CollaborationStatusCard
          entries={attention}
          runtimesById={runtimesById}
          busy={actionBusy}
          onOpen={openAttention}
          onRetry={() => void retryBlockedTasks()}
          onCancel={cancelBlockedTasks}
        />

        {showSkeleton ? (
          <AgentListSkeleton />
        ) : showError ? (
          <View className="flex-1 items-center justify-center gap-3 px-8">
            <Text className="text-center text-[15px] font-medium text-foreground">
              {t("list.load_failed_title")}
            </Text>
            <Text className="text-center text-xs text-muted-foreground">
              {agentsQuery.error instanceof Error
                ? agentsQuery.error.message
                : t("list.load_failed_fallback")}
            </Text>
            <Button variant="outline" onPress={() => agentsQuery.refetch()}>
              <Text>{t("common:actions.retry")}</Text>
            </Button>
          </View>
        ) : sections.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-[15px] font-medium text-foreground">
              {agents.length === 0
                ? t("list.empty_title")
                : t("list.empty_filtered_title")}
            </Text>
            <Text className="mt-1 text-center text-xs text-muted-foreground">
              {agents.length === 0
                ? t("list.empty_description")
                : t("list.empty_filtered_description")}
            </Text>
            <Button
              className="mt-4"
              onPress={agents.length === 0 ? openCreateAgent : clearFilters}
            >
              <Text>
                {agents.length === 0
                  ? t("list.empty_action")
                  : t("list.clear_filters")}
              </Text>
            </Button>
          </View>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            contentContainerClassName="pb-8"
            renderSectionHeader={({ section }) => (
              <View className="flex-row items-baseline justify-between bg-background px-4 pb-1 pt-5">
                <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`list.sections.${section.key}`)}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {section.data.length}
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <View>
                <View className="ml-16 h-px bg-border" />
                <AgentRow
                  agent={item}
                  presence={presenceByAgent.get(item.id)}
                  runtime={runtimesById.get(item.runtime_id) ?? null}
                  onPress={() => openAgent(item.id)}
                />
              </View>
            )}
          />
        )}
      </View>

      <View
        className="flex-1"
        style={{ display: segment === "squads" ? "flex" : "none" }}
      >
        <SquadsListBody query={query} onClearSearch={() => setQuery("")} />
      </View>
    </View>
  );
}

function AgentListSkeleton() {
  return (
    <View className="flex-1 gap-4 px-4 pt-4">
      {[0, 1, 2, 3].map((index) => (
        <View key={index} className="flex-row items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <View className="flex-1 gap-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-24" />
          </View>
        </View>
      ))}
    </View>
  );
}
