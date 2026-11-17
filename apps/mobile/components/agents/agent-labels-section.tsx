/**
 * Agent labels block on the detail screen. The agent payload does not inline
 * labels, so this reads the dedicated `/agents/{id}/labels` endpoint and shares
 * the label catalog shape with the issue label picker.
 */
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { Agent } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { agentLabelsOptions } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";

export function AgentLabelsSection({
  agent,
  canEdit,
}: {
  agent: Agent;
  canEdit: boolean;
}) {
  const { t } = useT("agents");
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const labels = useQuery(agentLabelsOptions(wsId, agent.id));

  const openEditor = () => {
    if (!canEdit || !wsSlug) return;
    router.push({
      pathname: "/[workspace]/agent/[id]/labels",
      params: { workspace: wsSlug, id: agent.id },
    });
  };

  const items = labels.data ?? [];

  return (
    <View className="border-t border-border px-4 py-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("labels.title")}
        </Text>
        <View className="flex-row items-center gap-3">
          {items.length > 0 ? (
            <Text className="text-xs text-muted-foreground">
              {items.length}
            </Text>
          ) : null}
          {canEdit ? (
            <Pressable onPress={openEditor} hitSlop={8}>
              <Text className="text-xs font-medium text-brand">
                {t("labels.edit")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {labels.isLoading && !labels.data ? (
        <Text className="py-2 text-sm text-muted-foreground">
          {t("labels.loading")}
        </Text>
      ) : labels.isError && !labels.data ? (
        <Pressable onPress={() => void labels.refetch()} hitSlop={8}>
          <Text className="py-2 text-sm text-muted-foreground">
            {t("labels.load_failed")}
          </Text>
        </Pressable>
      ) : items.length === 0 ? (
        <Pressable
          onPress={openEditor}
          disabled={!canEdit}
          className="py-2"
          hitSlop={8}
        >
          <Text className="text-sm text-muted-foreground">
            {t("labels.empty")}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={openEditor}
          disabled={!canEdit}
          className="flex-row flex-wrap gap-2 py-1"
        >
          {items.map((label) => (
            <View
              key={label.id}
              className="flex-row items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1"
            >
              <View
                className="size-2.5 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              <Text className="text-xs text-foreground" numberOfLines={1}>
                {label.name}
              </Text>
            </View>
          ))}
        </Pressable>
      )}
    </View>
  );
}
