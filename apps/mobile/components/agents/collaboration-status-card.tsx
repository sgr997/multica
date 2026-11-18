/**
 * Needs-attention card: queued work whose runtime cannot pick it up.
 *
 * There is at most one card. A single affected agent is named directly; the
 * multi-agent case aggregates so a long queue list never pushes the actual
 * roster off screen. Both actions stay inline because the whole point of the
 * card is that the user can unblock or clear the work without opening an
 * agent first:
 *
 *   Retry      re-enqueues the queued tasks (server rerun replaces an
 *              unstarted pending row for the same issue/agent);
 *   Cancel     bulk-cancels the affected agents' active tasks after a
 *              confirmation that spells out the queued + running scope.
 */
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RuntimeDevice } from "@multica/core/types";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { agentRuntimeParts, type AttentionEntry } from "@/lib/agent-list";
import { useT } from "@/lib/i18n";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";

export function CollaborationStatusCard({
  entries,
  runtimesById,
  busy,
  onOpen,
  onRetry,
  onCancel,
}: {
  entries: AttentionEntry[];
  runtimesById: ReadonlyMap<string, RuntimeDevice>;
  busy: boolean;
  onOpen: () => void;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const { t } = useT("agents");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  if (entries.length === 0) return null;

  const taskCount = entries.reduce((sum, entry) => sum + entry.count, 0);
  const only = entries.length === 1 ? entries[0] : null;
  const runtime = only ? runtimesById.get(only.agent.runtime_id) : undefined;
  const runtimeParts = agentRuntimeParts(runtime ?? null);
  const subtitle = only
    ? runtimeParts.provider
      ? `${runtimeParts.provider} · ${runtimeParts.machine || t("availability.offline")}`
      : t("attention.runtime_offline")
    : t("attention.multiple_subtitle");

  return (
    <View className="mx-4 mb-2 rounded-[14px] border border-warning/40 bg-warning/10">
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={
          only
            ? t("attention.single", { name: only.agent.name, count: only.count })
            : t("attention.multiple", {
                agents: entries.length,
                count: taskCount,
              })
        }
        className="flex-row items-start gap-3 px-3 pb-1 pt-3 active:opacity-80"
      >
        <View className="h-8 w-8 items-center justify-center rounded-full bg-warning/20">
          <Ionicons
            name="alert-circle-outline"
            size={18}
            color={theme.warningForeground}
          />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-semibold text-foreground">
            {only
              ? t("attention.single", {
                  name: only.agent.name,
                  count: only.count,
                })
              : t("attention.multiple", {
                  agents: entries.length,
                  count: taskCount,
                })}
          </Text>
          <Text
            className="mt-0.5 text-xs text-muted-foreground"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={15}
          color={theme.mutedForeground}
        />
      </Pressable>
      <View className="flex-row justify-end gap-1 px-2 pb-1.5">
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={onRetry}
          accessibilityRole="button"
        >
          <Text className="text-[13px] font-semibold text-brand">
            {busy ? t("attention.working") : t("attention.retry")}
          </Text>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onPress={onCancel}
          accessibilityRole="button"
        >
          <Text className="text-[13px] font-medium text-destructive">
            {t("attention.cancel")}
          </Text>
        </Button>
      </View>
    </View>
  );
}
