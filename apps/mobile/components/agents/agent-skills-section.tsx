/**
 * Editable skills block on the agent detail screen.
 *
 * Workspace skills and runtime-inherited skills are separate lists in the
 * backend: the first is an agent junction table (`/agents/{id}/skills`), the
 * second is a per-agent disable list over skills the runtime discovers
 * (`/agents/{id}/runtime-skills/enabled`). The runtime section only renders
 * when discovery actually returned skills — an offline or unsupported runtime
 * simply contributes nothing.
 */
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { Agent, RuntimeDevice } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Switch } from "@/components/ui/switch";
import {
  useRemoveAgentSkill,
  useSetAgentRuntimeSkillEnabled,
  useSetAgentSkillEnabled,
} from "@/data/mutations/agents";
import { runtimeLocalSkillsOptions } from "@/data/queries/runtimes";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  isRuntimeSkillDisabled,
  runtimeSkillRowKey,
} from "@/lib/agent-skills";
import { canBindRuntime } from "@/lib/runtime-access";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";
import { useT } from "@/lib/i18n";

export function AgentSkillsSection({
  agent,
  runtime,
  canEdit,
}: {
  agent: Agent;
  runtime: RuntimeDevice | null;
  canEdit: boolean;
}) {
  const { t } = useT("agents");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setEnabled = useSetAgentSkillEnabled(agent.id);
  const removeSkill = useRemoveAgentSkill(agent.id);
  const setRuntimeEnabled = useSetAgentRuntimeSkillEnabled(agent.id);

  const canDiscoverRuntimeSkills =
    !!runtime &&
    runtime.runtime_mode === "local" &&
    runtime.status === "online" &&
    canBindRuntime(runtime, userId);
  const runtimeSkillsQuery = useQuery(
    runtimeLocalSkillsOptions(
      canDiscoverRuntimeSkills ? wsId : null,
      canDiscoverRuntimeSkills ? (runtime?.id ?? null) : null,
    ),
  );
  const runtimeSkills = runtimeSkillsQuery.data?.skills ?? [];
  const busy = busyId !== null;

  const messageOf = (error: unknown) =>
    error instanceof Error ? error.message : "unknown";

  const confirmRemove = (skillId: string, name: string) => {
    if (busy) return;
    Alert.alert(
      t("skills.remove_title", { name }),
      t("skills.remove_message"),
      [
        { text: t("common:actions.cancel"), style: "cancel" },
        {
          text: t("skills.remove_confirm"),
          style: "destructive",
          onPress: () => {
            setBusyId(skillId);
            removeSkill.mutate(skillId, {
              onError: (error) =>
                Alert.alert(
                  t("skills.remove_title", { name }),
                  t("skills.remove_failed", { message: messageOf(error) }),
                ),
              onSettled: () => setBusyId(null),
            });
          },
        },
      ],
    );
  };

  const toggleSkill = (skillId: string, enabled: boolean) => {
    if (busy) return;
    setBusyId(skillId);
    // Optimistic: switch moves now, rolls back inside the mutation on error.
    setEnabled.mutate(
      { skillId, enabled },
      {
        onError: (error) =>
          Alert.alert(
            t("skills.title"),
            t("skills.toggle_failed", { message: messageOf(error) }),
          ),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const toggleRuntimeSkill = (
    skill: (typeof runtimeSkills)[number],
    enabled: boolean,
  ) => {
    if (!runtime || busy) return;
    const key = runtimeSkillRowKey(skill);
    setBusyId(key);
    setRuntimeEnabled.mutate(
      { runtimeId: runtime.id, skill, enabled },
      {
        onError: (error) =>
          Alert.alert(
            t("skills.runtime_title"),
            t("skills.runtime_toggle_failed", { message: messageOf(error) }),
          ),
        onSettled: () => setBusyId(null),
      },
    );
  };

  const openAdd = () => {
    if (!canEdit || !wsSlug) return;
    router.push({
      pathname: "/[workspace]/agent/[id]/skills/add",
      params: { workspace: wsSlug, id: agent.id },
    });
  };

  return (
    <View className="border-t border-border px-4 py-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("skills.title")}
        </Text>
        <View className="flex-row items-center gap-3">
          <Text className="text-xs text-muted-foreground">
            {agent.skills.length}
          </Text>
          {canEdit ? (
            <Pressable onPress={openAdd} hitSlop={8}>
              <Text className="text-xs font-medium text-brand">
                {t("skills.add")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {agent.skills.length === 0 ? (
        <Text className="py-2 text-sm text-muted-foreground">
          {t("skills.empty")}
        </Text>
      ) : (
        <View className="overflow-hidden rounded-lg border border-border">
          {agent.skills.map((skill, index) => {
            const enabled = skill.enabled !== false;
            return (
              <View key={skill.id}>
                {index > 0 ? <View className="ml-3 h-px bg-border" /> : null}
                <View className="flex-row items-center gap-3 px-3 py-2.5">
                  <View className="min-w-0 flex-1">
                    <Text
                      className={cn(
                        "text-sm font-medium",
                        enabled
                          ? "text-foreground"
                          : "text-muted-foreground",
                      )}
                      numberOfLines={1}
                    >
                      {skill.name}
                    </Text>
                    <Text
                      className="text-xs text-muted-foreground"
                      numberOfLines={1}
                    >
                      {skill.description || t("skills.no_description")}
                    </Text>
                  </View>
                  {canEdit ? (
                    <>
                      <Switch
                        checked={enabled}
                        disabled={busy}
                        onCheckedChange={(next) => toggleSkill(skill.id, next)}
                        accessibilityLabel={t("skills.toggle_aria", {
                          name: skill.name,
                        })}
                      />
                      <Pressable
                        disabled={busy}
                        onPress={() => confirmRemove(skill.id, skill.name)}
                        hitSlop={8}
                        accessibilityLabel={t("skills.remove_aria", {
                          name: skill.name,
                        })}
                        className={cn("p-1", busy && "opacity-40")}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={17}
                          color={theme.destructive}
                        />
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {runtimeSkills.length > 0 ? (
        <View className="mt-4">
          <View className="mb-1.5 flex-row items-baseline justify-between">
            <Text className="text-xs font-medium text-muted-foreground">
              {t("skills.runtime_title")}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {runtimeSkills.length}
            </Text>
          </View>
          <View className="overflow-hidden rounded-lg border border-border">
            {runtimeSkills.map((skill, index) => {
              const enabled = !isRuntimeSkillDisabled(
                agent.disabled_runtime_skills,
                runtime?.id ?? null,
                skill,
              );
              const key = runtimeSkillRowKey(skill);
              return (
                <View key={key}>
                  {index > 0 ? <View className="ml-3 h-px bg-border" /> : null}
                  <View className="flex-row items-center gap-3 px-3 py-2.5">
                    <View className="min-w-0 flex-1">
                      <Text
                        className={cn(
                          "text-sm font-medium",
                          enabled
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                        numberOfLines={1}
                      >
                        {skill.name}
                      </Text>
                      <Text
                        className="text-xs text-muted-foreground"
                        numberOfLines={1}
                      >
                        {skill.description ||
                          skill.source_path ||
                          t("skills.runtime_inherited")}
                      </Text>
                    </View>
                    {canEdit && skill.can_disable && skill.root ? (
                      <Switch
                        checked={enabled}
                        disabled={busy}
                        onCheckedChange={(next) =>
                          toggleRuntimeSkill(skill, next)
                        }
                        accessibilityLabel={t("skills.runtime_toggle_aria", {
                          name: skill.name,
                        })}
                      />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
