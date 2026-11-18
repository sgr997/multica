/**
 * One agent in the collaboration list.
 *
 * The row follows the decision order the page asks the user to make:
 * name + workload badge, then what the agent does, then the single piece of
 * runtime metadata that matters in the current state. A working row names
 * the machine; an idle row only needs the provider and connection label, so
 * repeated hostnames stop drowning the actual differences.
 *
 * Connection health stays on the avatar dot. Workload is always a text
 * badge — colour alone must not be the only signal for "running".
 */
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { AgentPresenceDetail } from "@multica/core/agents";
import type { Agent, RuntimeDevice } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { PresenceDot } from "@/components/ui/presence-dot";
import {
  agentRuntimeParts,
  effectiveAvailability,
  isArchivedAgent,
} from "@/lib/agent-list";
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
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const archived = isArchivedAgent(agent, presence);
  const availability = effectiveAvailability(agent, presence);
  const workload = presence?.workload ?? "idle";
  const runningCount = presence?.runningCount ?? 0;
  const queuedCount = presence?.queuedCount ?? 0;
  const working = !archived && (workload === "working" || runningCount > 0);

  const badge = archived
    ? {
        label: t("list.archived_badge"),
        className: "bg-muted",
        text: "text-muted-foreground",
      }
    : runningCount > 0
      ? {
          label: t("list.badge.running", { count: runningCount }),
          className: "bg-brand/10",
          text: "text-brand",
        }
      : workload === "working"
        ? {
            label: t("list.badge.working"),
            className: "bg-brand/10",
            text: "text-brand",
          }
        : queuedCount > 0
          ? {
              label: t("list.badge.queued", { count: queuedCount }),
              className: "bg-warning/15",
              text: "text-warning-foreground",
            }
          : null;

  const runtimeParts = agentRuntimeParts(runtime);
  const runtimeDetail =
    working || workload === "queued"
      ? runtimeParts.machine || t(`availability.${availability}`)
      : t(`availability.${availability}`);
  const runtimeLine = runtimeParts.provider
    ? `${runtimeParts.provider} · ${runtimeDetail}`
    : runtimeDetail;

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
          <Text
            className="shrink text-[15px] font-semibold text-foreground"
            numberOfLines={1}
          >
            {agent.name}
          </Text>
          {badge ? (
            <View className={`rounded px-1.5 py-0.5 ${badge.className}`}>
              <Text className={`text-[10px] font-medium ${badge.text}`}>
                {badge.label}
              </Text>
            </View>
          ) : null}
        </View>
        {agent.description.trim() ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {agent.description}
          </Text>
        ) : null}
        <Text
          className="shrink text-xs text-muted-foreground"
          numberOfLines={1}
        >
          {runtimeLine}
        </Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={15}
        color={theme.mutedForeground}
      />
    </Pressable>
  );
}
