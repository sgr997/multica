/**
 * One agent in the workspace Agents list. Mirrors the information density of
 * web's agents table row (avatar, name, description, presence, runtime,
 * current workload) without the table chrome phones can't fit.
 */
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AgentPresenceDetail } from "@multica/core/agents";
import type { Agent, RuntimeDevice } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { PresenceDot } from "@/components/ui/presence-dot";
import { activeTaskCount, effectiveAvailability } from "@/lib/agent-list";
import { useT } from "@/lib/i18n";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";

export function agentRuntimeLabel(runtime: RuntimeDevice | null): string {
  if (!runtime) return "";
  return runtime.custom_name?.trim() || runtime.name || runtime.provider;
}

export function AgentRow({
  agent,
  presence,
  runtime,
  onPress,
}: {
  agent: Agent;
  presence: AgentPresenceDetail | undefined;
  runtime: RuntimeDevice | null;
  onPress: () => void;
}) {
  const { t } = useT("agents");
  const { colorScheme } = useColorScheme();
  const archived = !!agent.archived_at;
  const activeCount = activeTaskCount(presence);
  const availability = effectiveAvailability(agent, presence);
  const workload = presence?.workload ?? "idle";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={agent.name}
      onPress={onPress}
      className="flex-row items-center gap-3 px-4 py-3 active:bg-secondary"
    >
      <View>
        <ActorAvatar
          type="agent"
          id={agent.id}
          name={agent.name}
          avatarUrl={agent.avatar_url}
          size={40}
        />
        {!archived ? (
          <View className="absolute -bottom-0.5 -right-0.5">
            <PresenceDot availability={availability} size={10} />
          </View>
        ) : null}
      </View>

      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="shrink text-sm font-medium text-foreground" numberOfLines={1}>
            {agent.name}
          </Text>
          {archived ? (
            <View className="rounded bg-muted px-1.5 py-0.5">
              <Text className="text-[10px] font-medium text-muted-foreground">
                {t("list.archived_badge")}
              </Text>
            </View>
          ) : null}
        </View>
        {agent.description.trim() ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {agent.description}
          </Text>
        ) : null}
        <View className="flex-row items-center gap-2">
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {archived
              ? t("availability.archived")
              : `${t(`availability.${availability}`)} · ${t(`workload.${workload}`)}`}
          </Text>
          {runtime ? (
            <>
              <Text className="text-xs text-muted-foreground/60">·</Text>
              <Text className="shrink text-xs text-muted-foreground" numberOfLines={1}>
                {agentRuntimeLabel(runtime)}
              </Text>
            </>
          ) : null}
          {activeCount > 0 ? (
            <>
              <Text className="text-xs text-muted-foreground/60">·</Text>
              <Text className="text-xs text-brand">
                {t("list.active_task_count", { count: activeCount })}
              </Text>
            </>
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
