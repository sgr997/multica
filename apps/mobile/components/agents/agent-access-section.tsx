/**
 * Invocation-access editor inside the detail screen's identity block.
 *
 * Owner-only, matching the backend: `PUT /api/agents/{id}` rejects a real
 * `permission_mode` / `invocation_targets` change from a non-owner admin
 * (403), even though admins may edit every other agent field. Non-owners see
 * the current summary and no controls.
 *
 * The three rows are the web picker's model mapped onto the wire contract:
 *   private   -> permission_mode "private", no targets
 *   workspace -> permission_mode "public_to" + workspace target
 *   allowlist -> permission_mode "public_to" + member targets
 * Team targets are preserved untouched (inert in V1, not editable here).
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Agent, MemberWithUser } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useUpdateAgent } from "@/data/mutations/agents";
import {
  agentAccessScope,
  agentAccessTargets,
  buildAgentAccessPayload,
  type AgentAccessScope,
} from "@/lib/agent-access";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";
import { useT } from "@/lib/i18n";

const SCOPES: AgentAccessScope[] = ["private", "workspace", "allowlist"];

export function AgentAccessSection({
  agent,
  members,
  isOwner,
}: {
  agent: Agent;
  members: MemberWithUser[];
  isOwner: boolean;
}) {
  const { t } = useT("agents");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const update = useUpdateAgent(agent.id);

  const persisted = {
    scope: agentAccessScope(agent.permission_mode, agent.invocation_targets),
    memberIds: agentAccessTargets(agent.invocation_targets).memberIds,
  };
  const persistedKey = `${persisted.scope}:${persisted.memberIds.join(",")}`;

  const [scope, setScope] = useState<AgentAccessScope>(persisted.scope);
  const [memberIds, setMemberIds] = useState<string[]>(persisted.memberIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastPersisted = useRef(persistedKey);

  // Reset the draft when the server state changes underneath us (save
  // response, another device, a realtime agent update). Value-compared so an
  // identical refetch does not discard an in-progress selection.
  useEffect(() => {
    if (persistedKey === lastPersisted.current || saving) return;
    lastPersisted.current = persistedKey;
    setScope(persisted.scope);
    setMemberIds(persisted.memberIds);
  }, [persistedKey, persisted.scope, persisted.memberIds, saving]);

  const selectScope = (next: AgentAccessScope) => {
    setError(null);
    setScope(next);
  };

  const toggleMember = (userId: string) => {
    setError(null);
    setMemberIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };

  const editableMembers = agent.owner_id
    ? members.filter((member) => member.user_id !== agent.owner_id)
    : members;

  const sameMembers =
    memberIds.length === persisted.memberIds.length &&
    memberIds.every((id) => persisted.memberIds.includes(id));
  const dirty =
    scope !== persisted.scope ||
    (scope === "allowlist" && !sameMembers);
  const payload = buildAgentAccessPayload(
    scope,
    memberIds,
    agent.invocation_targets,
  );

  const persist = async () => {
    if (saving || !payload) return;
    setSaving(true);
    setError(null);
    try {
      await update.mutateAsync(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "unknown");
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!dirty || saving || !payload) return;
    if (scope === "private") {
      Alert.alert(
        t("access.private_confirm_title"),
        t("access.private_confirm_message"),
        [
          { text: t("common:actions.cancel"), style: "cancel" },
          {
            text: t("access.private_confirm_action"),
            style: "destructive",
            onPress: () => void persist(),
          },
        ],
      );
      return;
    }
    void persist();
  };

  if (!isOwner) {
    return (
      <View className="flex-row items-start gap-3 py-1.5">
        <Text className="w-24 text-xs text-muted-foreground">
          {t("access.label")}
        </Text>
        <View className="min-w-0 flex-1">
          <Text className="text-sm text-foreground">
            {t(`access.summary.${persisted.scope}`)}
          </Text>
          <Text className="mt-0.5 text-xs text-muted-foreground">
            {t("access.owner_only")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-2 py-1.5">
      <Text className="text-xs text-muted-foreground">{t("access.label")}</Text>

      <View className="overflow-hidden rounded-lg border border-border">
        {SCOPES.map((value, index) => {
          const selected = scope === value;
          return (
            <View key={value}>
              {index > 0 ? <View className="ml-3 h-px bg-border" /> : null}
              <Pressable
                onPress={() => selectScope(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                className="flex-row items-start gap-3 px-3 py-2.5 active:bg-secondary"
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={selected ? theme.brand : theme.mutedForeground}
                  style={{ marginTop: 1 }}
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-medium text-foreground">
                    {t(`access.scope.${value}.title`)}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    {t(`access.scope.${value}.description`)}
                  </Text>
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>

      {scope === "allowlist" ? (
        <View className="mt-1">
          <Text className="mb-1.5 text-xs font-medium text-muted-foreground">
            {t("access.members_title")}
          </Text>
          {editableMembers.length === 0 ? (
            <Text className="text-xs text-muted-foreground">
              {t("access.members_empty")}
            </Text>
          ) : (
            <View className="overflow-hidden rounded-lg border border-border">
              {editableMembers.map((member, index) => {
                const checked = memberIds.includes(member.user_id);
                return (
                  <View key={member.user_id}>
                    {index > 0 ? (
                      <View className="ml-3 h-px bg-border" />
                    ) : null}
                    <Pressable
                      onPress={() => toggleMember(member.user_id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      className="flex-row items-center gap-2.5 px-3 py-2.5 active:bg-secondary"
                    >
                      <Ionicons
                        name={checked ? "checkmark-circle" : "ellipse-outline"}
                        size={19}
                        color={
                          checked ? theme.brand : theme.mutedForeground
                        }
                      />
                      <Text
                        className="min-w-0 flex-1 text-sm text-foreground"
                        numberOfLines={1}
                      >
                        {member.name || member.email}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}
          {memberIds.length === 0 ? (
            <Text className="mt-1.5 text-xs text-destructive">
              {t("access.members_required")}
            </Text>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text className="text-xs text-destructive">
          {t("access.save_failed", { message: error })}
        </Text>
      ) : null}

      <Button
        size="sm"
        variant="outline"
        className="mt-1 self-start"
        disabled={!dirty || saving || !payload}
        onPress={save}
      >
        <Text>{saving ? t("access.saving") : t("access.save")}</Text>
      </Button>
    </View>
  );
}
