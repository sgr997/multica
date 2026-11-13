/**
 * Workspace Agents list (Phase 1).
 *
 * Sections mirror the operational priority of the web agents page:
 * active (online / unstable) first, then offline, then archived behind a
 * toggle. Presence + active-task counts come from the shared workspace
 * presence map, so the list performs one batch derivation rather than
 * subscribing each row independently.
 *
 * The list always requests `include_archived=true`; the toggle is a client
 * filter. That keeps opening archived agents instant and avoids a second
 * network round-trip when the user flips the switch.
 */
import { useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  RefreshControl,
  SectionList,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { Agent } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { TextField } from "@/components/ui/text-field";
import { AgentRow, agentRuntimeLabel } from "@/components/agents/agent-row";
import { agentListOptions } from "@/data/queries/agents";
import { runtimeListOptions } from "@/data/queries/runtimes";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useWorkspacePresenceMap } from "@/lib/use-agent-presence";
import { groupAgents, type AgentSectionKey } from "@/lib/agent-list";
import { useRefreshWithHaptics } from "@/lib/use-refresh-with-haptics";
import { useT } from "@/lib/i18n";

interface AgentSectionData {
  key: AgentSectionKey;
  data: Agent[];
}

export default function AgentsPage() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { t } = useT("agents");

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const { data: agents = [], isLoading, error, refetch } = useQuery(
    agentListOptions(wsId, { includeArchived: true }),
  );
  const { data: runtimes = [] } = useQuery(runtimeListOptions(wsId));
  const { byAgent: presenceByAgent } = useWorkspacePresenceMap(wsId);
  const { refreshing, onRefresh } = useRefreshWithHaptics(refetch);

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

  const openAgent = (id: string) => {
    if (!wsSlug) return;
    router.push({
      pathname: "/[workspace]/agent/[id]",
      params: { workspace: wsSlug, id },
    });
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          headerRight: () => (
            <View className="flex-row items-center">
              <IconButton
                name="search"
                onPress={() => {
                  if (searchOpen) {
                    setQuery("");
                    setSearchOpen(false);
                  } else {
                    setSearchOpen(true);
                  }
                }}
                accessibilityLabel={t("common:actions.search")}
              />
              <IconButton
                name="ellipsis-horizontal-circle"
                onPress={openFilter}
                accessibilityLabel={t("list.filter_title")}
              />
            </View>
          ),
        }}
      />

      {searchOpen ? (
        <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
          <TextField
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={t("list.search_placeholder")}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="sm"
            onPress={() => {
              setQuery("");
              setSearchOpen(false);
            }}
          >
            <Text>{t("common:actions.cancel")}</Text>
          </Button>
        </View>
      ) : null}

      {isLoading && agents.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : error && agents.length === 0 ? (
        <View className="flex-1 gap-3 px-4 pt-6">
          <Text className="text-sm text-destructive">
            {t("list.load_failed", {
              message: error instanceof Error ? error.message : "unknown",
            })}
          </Text>
          <Button variant="outline" onPress={() => refetch()}>
            <Text>{t("common:actions.retry")}</Text>
          </Button>
        </View>
      ) : sections.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted-foreground">
            {agents.length === 0 ? t("list.empty") : t("list.empty_filtered")}
          </Text>
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
  );
}
