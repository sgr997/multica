/**
 * Agent-scoped execution record. Reuses the issue run transcript component
 * and message cache; only the task lookup and realtime invalidation target
 * differ because a chat/autopilot task has no issue id.
 */
import { ActivityIndicator, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { AgentTask } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { PulseDot } from "@/components/ui/pulse-dot";
import { RunTranscript } from "@/components/issue/run-transcript";
import { agentTasksOptions } from "@/data/queries/agents";
import { runTranscriptMessagesOptions } from "@/data/queries/chat";
import { useAgentRunTranscriptRealtime } from "@/data/realtime/use-run-transcript-realtime";
import { useActorLookup } from "@/data/use-actor-name";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";
import { formatElapsedSecs } from "@/lib/format-elapsed";
import { isCancellableRunStatus, isRunTranscriptTaskId } from "@/lib/run-transcript";
import { useElapsedSecs } from "@/lib/use-elapsed-secs";

export default function AgentRunTranscriptRoute() {
  const params = useLocalSearchParams<{ id?: string; taskId?: string }>();
  const agentId = typeof params.id === "string" ? params.id : "";
  const taskId = isRunTranscriptTaskId(params.taskId) ? params.taskId : null;
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { getName } = useActorLookup();
  const { t } = useT("issues");

  const tasksQuery = useQuery(agentTasksOptions(wsId, agentId, { limit: 200 }));
  const task = taskId
    ? tasksQuery.data?.find((candidate) => candidate.id === taskId)
    : undefined;
  const transcriptQuery = useQuery(runTranscriptMessagesOptions(task?.id));
  useAgentRunTranscriptRealtime(agentId, task?.id);

  const retry = () => {
    void tasksQuery.refetch();
    if (task) void transcriptQuery.refetch();
  };

  if (tasksQuery.isLoading || (task && transcriptQuery.isLoading)) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator />
        <Text className="text-sm text-muted-foreground">
          {t("runs.transcript.loading")}
        </Text>
      </View>
    );
  }

  if (
    (tasksQuery.error && !tasksQuery.data) ||
    (transcriptQuery.error && !transcriptQuery.data)
  ) {
    return (
      <StateMessage text={t("runs.transcript.load_error")}>
        <Button variant="outline" onPress={retry}>
          <Text>{t("runs.transcript.retry")}</Text>
        </Button>
      </StateMessage>
    );
  }

  if (!taskId || !task) {
    return <StateMessage text={t("runs.transcript.missing")} />;
  }

  const summary = task.trigger_summary?.trim() || t("summary.direct");

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: t("navigation:routes.execution_record"),
          headerBackTitle: t("common:actions.back"),
        }}
      />
      <RunTranscript
        task={task}
        items={transcriptQuery.data ?? []}
        header={
          <View className="flex-row items-start gap-3 rounded-lg bg-muted/40 px-3 py-3">
            <ActorAvatar type="agent" id={task.agent_id} size={32} showPresence />
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-sm font-semibold text-foreground">
                {getName("agent", task.agent_id)}
              </Text>
              <Text className="text-sm text-muted-foreground">{summary}</Text>
              <RunStatusLine task={task} />
            </View>
          </View>
        }
      />
    </View>
  );
}

function StateMessage({
  text,
  children,
}: {
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
      <Text className="text-center text-sm text-muted-foreground">{text}</Text>
      {children}
    </View>
  );
}

function RunStatusLine({ task }: { task: AgentTask }) {
  const { t } = useT("issues");
  const active = isCancellableRunStatus(task.status);
  const elapsed = useElapsedSecs(task.started_at ?? task.created_at, active);

  return (
    <View className="flex-row items-center gap-1.5">
      {active ? <PulseDot size={6} /> : null}
      <Text className={statusClass(task.status)}>
        {t(`runs.status.${task.status}`)}
        {active ? (
          <Text className="text-xs text-muted-foreground">
            {" · "}
            {formatElapsedSecs(elapsed)}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

function statusClass(status: string): string {
  if (status === "failed") return "text-xs text-destructive";
  if (status === "running" || status === "dispatched") return "text-xs text-brand";
  return "text-xs text-muted-foreground";
}
