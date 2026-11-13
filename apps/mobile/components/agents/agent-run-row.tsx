/**
 * Compact run row for the agent detail Work section. Same status vocabulary
 * and timestamp rules as the issue Runs sheet (`components/issue/run-row`),
 * but the destination is the agent-scoped transcript because chat/autopilot
 * runs have no issue to query.
 */
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { AgentTask } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { runFailureBadgeLabel } from "@/lib/run-failure-badge";
import { timeAgo } from "@/lib/time-ago";
import {
  agentRunTranscriptRoute,
  isCancellableRunStatus,
} from "@/lib/run-transcript";
import { useT } from "@/lib/i18n";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";

export function AgentRunRow({
  task,
  workspace,
  agentId,
}: {
  task: AgentTask;
  workspace: string;
  agentId: string;
}) {
  const { t } = useT("issues");
  const { colorScheme } = useColorScheme();
  const active = isCancellableRunStatus(task.status);
  const summary = task.trigger_summary?.trim() || fallbackSummary(task, t);
  const timestamp = task.completed_at || task.started_at || task.created_at;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        active ? "runs.open_live_transcript" : "runs.open_transcript",
        { summary },
      )}
      onPress={() =>
        router.push(agentRunTranscriptRoute(workspace, agentId, task.id))
      }
      className="flex-row items-start gap-3 px-4 py-3 active:bg-secondary"
    >
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-1.5">
          {active ? <View className="size-1.5 rounded-full bg-brand" /> : null}
          <Text className="shrink text-sm text-foreground" numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <StatusText task={task} />
          <Text className="text-xs text-muted-foreground">
            {timestamp ? timeAgo(timestamp) : ""}
          </Text>
          {task.issue_identifier ? (
            <Text className="text-xs text-muted-foreground">
              {task.issue_identifier}
            </Text>
          ) : null}
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={15}
        color={THEME[colorScheme === "dark" ? "dark" : "light"].mutedForeground}
      />
    </Pressable>
  );
}

function StatusText({ task }: { task: AgentTask }) {
  const { t } = useT("issues");
  const label = t(`runs.status.${task.status}`);
  const tone =
    task.status === "failed"
      ? "text-destructive"
      : task.status === "running" || task.status === "dispatched"
        ? "text-brand"
        : "text-muted-foreground";
  const reason =
    task.status === "failed" ? runFailureBadgeLabel(task.failure_reason) : null;
  return (
    <Text className={`text-xs ${tone}`}>
      {reason ? `${label} · ${reason}` : label}
    </Text>
  );
}

function fallbackSummary(
  task: AgentTask,
  t: (key: string) => string,
): string {
  switch (task.kind) {
    case "comment":
      return t("summary.comment");
    case "autopilot":
      return t("summary.autopilot");
    case "chat":
      return t("summary.chat");
    case "quick_create":
      return t("summary.quick_create");
    case "direct":
    default:
      return t("summary.direct");
  }
}
