/**
 * Agent detail (Phase 1).
 *
 * One scroll surface, matching web's object page order: identity header,
 * Work (active + recent runs), Instructions, Channels & identity, then a
 * read-only capabilities summary. Profile / model edits live in the
 * `edit` modal; instructions get a dedicated full-screen editor.
 *
 * Presence and active-task counts are read from the shared workspace
 * presence derivation, refreshed by `usePresenceRealtime` plus foreground
 * refetch. The detail query itself is invalidated by `agent:*` events.
 */
import { useMemo } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { canEditAgent } from "@multica/core/permissions/rules";
import { ApiError } from "@/data/api";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { PresenceDot } from "@/components/ui/presence-dot";
import { agentRuntimeLabel } from "@/components/agents/agent-row";
import { AgentRunRow } from "@/components/agents/agent-run-row";
import { AgentSkillsSection } from "@/components/agents/agent-skills-section";
import { AgentLabelsSection } from "@/components/agents/agent-labels-section";
import { AgentAccessSection } from "@/components/agents/agent-access-section";
import { AgentRuntimeConfigSection } from "@/components/agents/agent-runtime-config-section";
import { Markdown } from "@/lib/markdown";
import {
  agentDetailOptions,
  agentTasksOptions,
} from "@/data/queries/agents";
import { memberListOptions } from "@/data/queries/members";
import { runtimeListOptions } from "@/data/queries/runtimes";
import { useCancelAgentTasks, useArchiveAgent, useRestoreAgent } from "@/data/mutations/agents";
import { useAgentInstructionsDraftStore } from "@/data/stores/agent-instructions-draft-store";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useAgentPresence } from "@/lib/use-agent-presence";
import { activeTaskCount, effectiveAvailability } from "@/lib/agent-list";
import { isCancellableRunStatus } from "@/lib/run-transcript";
import { useRefreshWithHaptics } from "@/lib/use-refresh-with-haptics";
import { useLocale, useT } from "@/lib/i18n";

export default function AgentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { t } = useT("agents");
  const locale = useLocale();

  const detail = useQuery(agentDetailOptions(wsId, id));
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: runtimes = [] } = useQuery(runtimeListOptions(wsId));
  const tasks = useQuery(agentTasksOptions(wsId, id, { limit: 50 }));
  const presence = useAgentPresence(wsId, id);
  const draft = useAgentInstructionsDraftStore((s) => s.drafts[id]);

  const agent = detail.data && detail.data.id ? detail.data : null;
  const role = members.find((member) => member.user_id === userId)?.role ?? null;
  const canEdit = agent
    ? canEditAgent(agent, { userId, role }).allowed
    : false;
  const isOwner = !!agent && agent.owner_id !== null && agent.owner_id === userId;

  const archive = useArchiveAgent(id);
  const restore = useRestoreAgent(id);
  const cancelTasks = useCancelAgentTasks(id);

  const { refreshing, onRefresh } = useRefreshWithHaptics(async () => {
    await Promise.all([
      detail.refetch(),
      tasks.refetch(),
    ]);
  });

  const runtime = agent
    ? runtimes.find((candidate) => candidate.id === agent.runtime_id) ?? null
    : null;
  const owner = agent?.owner_id
    ? members.find((member) => member.user_id === agent.owner_id) ?? null
    : null;
  const presenceDetail = presence === "loading" ? undefined : presence;
  const runningCount = presenceDetail ? activeTaskCount(presenceDetail) : 0;

  const taskList = useMemo(() => tasks.data ?? [], [tasks.data]);
  const activeTasks = useMemo(
    () => taskList.filter((task) => isCancellableRunStatus(task.status)),
    [taskList],
  );
  const recentTasks = useMemo(
    () =>
      taskList
        .filter((task) => !isCancellableRunStatus(task.status))
        .sort(
          (a, b) =>
            Date.parse(b.completed_at ?? b.created_at) -
            Date.parse(a.completed_at ?? a.created_at),
        )
        .slice(0, 8),
    [taskList],
  );

  const openActions = () => {
    if (!agent || !canEdit) return;
    const actions: (
      "edit_profile" | "archive" | "restore" | "cancel_tasks" | "cancel"
    )[] = ["edit_profile"];
    if (agent.archived_at) actions.push("restore");
    else if (!agent.system_key) actions.push("archive");
    if (runningCount > 0) actions.push("cancel_tasks");
    actions.push("cancel");

    const options = actions.map((action) =>
      action === "edit_profile"
        ? t("detail.edit_profile")
        : action === "archive"
          ? t("detail.archive")
          : action === "restore"
            ? t("detail.restore")
            : action === "cancel_tasks"
              ? t("detail.cancel_tasks")
              : t("common:actions.cancel"),
    );
    const destructiveIndex = actions.indexOf("archive");

    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: actions.length - 1,
        destructiveButtonIndex:
          destructiveIndex >= 0 ? destructiveIndex : undefined,
      },
      (index) => {
        const action = actions[index];
        if (action === "edit_profile") {
          router.push({
            pathname: "/[workspace]/agent/[id]/edit",
            params: { workspace: wsSlug ?? "", id },
          });
        } else if (action === "archive") {
          confirmArchive();
        } else if (action === "restore") {
          restore.mutate(undefined, {
            onError: (error) =>
              Alert.alert(
                t("detail.restore"),
                t("archive.restore_failed", { message: messageOf(error) }),
              ),
          });
        } else if (action === "cancel_tasks") {
          confirmCancelTasks();
        }
      },
    );
  };

  const confirmArchive = () => {
    Alert.alert(t("archive.title"), t("archive.message"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("archive.confirm"),
        style: "destructive",
        onPress: () =>
          archive.mutate(undefined, {
            onError: (error) =>
              Alert.alert(
                t("detail.archive"),
                t("archive.archive_failed", { message: messageOf(error) }),
              ),
          }),
      },
    ]);
  };

  const confirmCancelTasks = () => {
    Alert.alert(t("cancel.title"), t("cancel.message"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("cancel.confirm"),
        style: "destructive",
        onPress: () =>
          cancelTasks.mutate(undefined, {
            onSuccess: (result) =>
              Alert.alert(
                t("cancel.confirm"),
                t("cancel.done", { count: result.cancelled }),
              ),
            onError: (error) =>
              Alert.alert(
                t("cancel.confirm"),
                t("cancel.failed", { message: messageOf(error) }),
              ),
          }),
      },
    ]);
  };

  if (detail.isLoading && !agent) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!agent) {
    const status = detail.error instanceof ApiError ? detail.error.status : 0;
    const message =
      status === 403
        ? t("detail.forbidden")
        : status === 404
          ? t("detail.not_found")
          : t("detail.load_failed");
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <Text className="text-center text-sm text-muted-foreground">{message}</Text>
        <Button variant="outline" onPress={() => detail.refetch()}>
          <Text>{t("common:actions.retry")}</Text>
        </Button>
      </View>
    );
  }

  const archived = !!agent.archived_at;
  const availability = effectiveAvailability(agent, presenceDetail);
  const workload = presenceDetail?.workload ?? "idle";
  const instructions = draft?.content ?? agent.instructions;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen
        options={{
          title: agent.name || t("detail.sections.work"),
          headerBackTitle: t("common:actions.back"),
          headerRight: canEdit
            ? () => (
                <IconButton
                  name="ellipsis-horizontal"
                  onPress={openActions}
                  accessibilityLabel={t("detail.actions_aria")}
                />
              )
            : undefined,
        }}
      />
      <ScrollView
        contentContainerClassName="pb-10"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {archived ? (
          <View className="mx-4 mt-4 rounded-lg bg-muted px-3 py-2">
            <Text className="text-xs text-muted-foreground">
              {t("detail.archived_notice")}
            </Text>
          </View>
        ) : null}

        <View className="flex-row items-start gap-3 px-4 pb-4 pt-4">
          <ActorAvatar
            type="agent"
            id={agent.id}
            name={agent.name}
            avatarUrl={agent.avatar_url}
            size={56}
          />
          <View className="min-w-0 flex-1 gap-1">
            <View className="flex-row items-center gap-2">
              <Text className="shrink text-xl font-semibold text-foreground" numberOfLines={2}>
                {agent.name}
              </Text>
              {agent.system_key ? (
                <View className="rounded bg-brand/15 px-1.5 py-0.5">
                  <Text className="text-[10px] font-medium text-brand">
                    {t("detail.capabilities.system_agent")}
                  </Text>
                </View>
              ) : null}
            </View>
            {agent.description.trim() ? (
              <Text className="text-sm text-muted-foreground" numberOfLines={3}>
                {agent.description}
              </Text>
            ) : null}
            <View className="mt-0.5 flex-row flex-wrap items-center gap-2">
              <View className="flex-row items-center gap-1.5">
                <PresenceDot availability={availability} size={8} />
                <Text className="text-xs text-muted-foreground">
                  {t(`availability.${availability}`)}
                </Text>
              </View>
              {!archived ? (
                <Text className="text-xs text-muted-foreground">
                  {t(`workload.${workload}`)}
                </Text>
              ) : null}
              {runningCount > 0 ? (
                <Text className="text-xs text-brand">
                  {t("list.active_task_count", { count: runningCount })}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View className="border-y border-border bg-background">
          <InfoRow
            label={t("detail.owner")}
            value={owner?.name ?? t("detail.unknown")}
          />
          <Divider />
          <InfoRow
            label={t("detail.runtime")}
            value={
              runtime
                ? agentRuntimeLabel(runtime)
                : agent.runtime_id
                  ? t("detail.unknown")
                  : t("detail.unbound")
            }
          />
          <Divider />
          <InfoRow
            label={t("detail.model")}
            value={agent.model || t("detail.runtime_default")}
            mono={!!agent.model}
          />
          <Divider />
          <InfoRow
            label={t("detail.thinking")}
            value={agent.thinking_level || t("detail.runtime_default")}
            mono={!!agent.thinking_level}
          />
          {agent.service_tier ? (
            <>
              <Divider />
              <InfoRow
                label={t("detail.service_tier")}
                value={agent.service_tier}
                mono
              />
            </>
          ) : null}
        </View>

        <Section
          title={t("detail.sections.work")}
          trailing={`${activeTasks.length + recentTasks.length}`}
        >
          {taskList.length === 0 ? (
            <EmptyLine text={t("detail.work.empty_all")} />
          ) : (
            <>
              <SubHeader
                title={t("detail.work.active")}
                count={activeTasks.length}
              />
              {activeTasks.length === 0 ? (
                <EmptyLine text={t("detail.work.empty_active")} />
              ) : (
                activeTasks.map((task, index) => (
                  <View key={task.id}>
                    {index > 0 ? <Divider inset /> : null}
                    <AgentRunRow
                      task={task}
                      workspace={wsSlug ?? ""}
                      agentId={agent.id}
                    />
                  </View>
                ))
              )}
              <SubHeader
                title={t("detail.work.recent")}
                count={recentTasks.length}
              />
              {recentTasks.map((task, index) => (
                <View key={task.id}>
                  {index > 0 ? <Divider inset /> : null}
                  <AgentRunRow
                    task={task}
                    workspace={wsSlug ?? ""}
                    agentId={agent.id}
                  />
                </View>
              ))}
            </>
          )}
        </Section>

        <Section title={t("detail.sections.instructions")}>
          {draft ? (
            <View className="mb-2 flex-row items-center gap-1.5">
              <View className="size-1.5 rounded-full bg-warning" />
              <Text className="text-xs text-warning">
                {t("detail.instructions.draft_pending")}
              </Text>
            </View>
          ) : null}
          {instructions.trim() ? (
            <View className="rounded-lg border border-border bg-card px-3 py-3">
              <Markdown content={instructions} />
            </View>
          ) : (
            <Text className="text-sm text-muted-foreground">
              {t("detail.instructions.empty")}
            </Text>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-3 self-start"
            onPress={() =>
              router.push({
                pathname: "/[workspace]/agent/[id]/instructions",
                params: { workspace: wsSlug ?? "", id },
              })
            }
          >
            <Text>{t("detail.instructions.edit")}</Text>
          </Button>
        </Section>

        <AgentLabelsSection agent={agent} canEdit={canEdit} />

        <Section title={t("detail.sections.identity")}>
          <InfoLine
            label={t("detail.identity.agent_id")}
            value={agent.id}
            mono
          />
          <InfoLine
            label={t("detail.identity.runtime")}
            value={runtime ? agentRuntimeLabel(runtime) : t("detail.unbound")}
          />
          <InfoLine
            label={t("detail.identity.provider")}
            value={runtime?.provider || t("detail.unknown")}
            mono={!!runtime?.provider}
          />
          <AgentAccessSection
            agent={agent}
            members={members}
            isOwner={isOwner}
          />
          <InfoLine
            label={t("detail.identity.owner")}
            value={owner?.name ?? t("detail.unknown")}
          />
          <InfoLine
            label={t("detail.identity.created")}
            value={formatDate(agent.created_at, locale)}
          />
          <InfoLine
            label={t("detail.identity.channels")}
            value={t("detail.identity.channels_web_only")}
          />
        </Section>

        <AgentRuntimeConfigSection
          agent={agent}
          runtime={runtime}
          canEdit={canEdit}
        />

        <AgentSkillsSection agent={agent} runtime={runtime} canEdit={canEdit} />
      </ScrollView>
    </SafeAreaView>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Section({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="border-t border-border px-4 py-4">
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </Text>
        {trailing ? (
          <Text className="text-xs text-muted-foreground">{trailing}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function SubHeader({ title, count }: { title: string; count: number }) {
  return (
    <View className="flex-row items-baseline justify-between px-0 pb-1 pt-2">
      <Text className="text-xs font-medium text-muted-foreground">{title}</Text>
      <Text className="text-xs text-muted-foreground">{count}</Text>
    </View>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <Text className="px-0 py-2 text-sm text-muted-foreground">{text}</Text>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-2.5">
      <Text className="w-20 text-xs text-muted-foreground">{label}</Text>
      <Text
        className={`min-w-0 flex-1 text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function InfoLine({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View className="flex-row items-start gap-3 py-1.5">
      <Text className="w-24 text-xs text-muted-foreground">{label}</Text>
      <Text
        selectable={mono}
        className={`min-w-0 flex-1 text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </Text>
    </View>
  );
}

function Divider({ inset }: { inset?: boolean }) {
  return <View className={`h-px bg-border ${inset ? "ml-16" : ""}`} />;
}
