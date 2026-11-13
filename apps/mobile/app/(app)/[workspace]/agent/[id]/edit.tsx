/**
 * Agent profile / execution editor (Phase 1).
 *
 * Name, description, avatar, model, thinking level and (Codex only) service
 * tier. Avatar changes are written immediately through the optimistic
 * mutation, matching the account profile flow; the rest save together.
 *
 * Concurrency: `PUT /api/agents/{id}` is last-write-wins. Before saving we
 * refetch the agent and compare the `updated_at` the form was seeded from
 * against the server's current value. A mismatch opens the overwrite/reload
 * choice instead of silently discarding another editor's change.
 */
import { useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { EmojiKeyboard, type EmojiType } from "rn-emoji-keyboard";
import type { Agent, UpdateAgentRequest } from "@multica/core/types";
import { api, type FileAsset } from "@/data/api";
import { agentDetailOptions } from "@/data/queries/agents";
import { runtimeListOptions } from "@/data/queries/runtimes";
import { useUpdateAgent } from "@/data/mutations/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { AutosizeTextArea } from "@/components/ui/autosize-textarea";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { decideAgentSave } from "@/lib/agent-save-conflict";
import { useT } from "@/lib/i18n";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export default function AgentEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const detail = useQuery(agentDetailOptions(wsId, id));
  const agent = detail.data && detail.data.id ? detail.data : null;

  if (detail.isLoading && !agent) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (!agent) {
    return <MissingAgent />;
  }

  return <AgentEditForm agent={agent} detail={detail} />;
}

function MissingAgent() {
  const { t } = useT("agents");
  return (
    <View className="flex-1 items-center justify-center bg-background px-8">
      <Text className="text-center text-sm text-muted-foreground">
        {t("edit.missing")}
      </Text>
    </View>
  );
}

function AgentEditForm({
  agent,
  detail,
}: {
  agent: Agent;
  detail: UseQueryResult<Agent>;
}) {
  const { t } = useT("agents");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const update = useUpdateAgent(agent.id);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { data: runtimes = [] } = useQuery(runtimeListOptions(wsId));

  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description);
  const [model, setModel] = useState(agent.model);
  const [thinking, setThinking] = useState(agent.thinking_level ?? "");
  const [serviceTier, setServiceTier] = useState(agent.service_tier ?? "");
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(agent.updated_at);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const provider =
    runtimes.find((runtime) => runtime.id === agent.runtime_id)?.provider ?? "";
  const supportsModel = provider !== "qoder";
  const showServiceTier = provider === "codex" || !!agent.service_tier;

  const dirty =
    name.trim() !== agent.name ||
    description.trim() !== agent.description ||
    model.trim() !== agent.model ||
    thinking.trim() !== (agent.thinking_level ?? "") ||
    (showServiceTier &&
      serviceTier.trim() !== (agent.service_tier ?? ""));

  const resetFrom = (latest: Agent) => {
    setName(latest.name);
    setDescription(latest.description);
    setModel(latest.model);
    setThinking(latest.thinking_level ?? "");
    setServiceTier(latest.service_tier ?? "");
    setBaseUpdatedAt(latest.updated_at);
  };

  const save = async (overwrite = false) => {
    if (saving || !name.trim()) return;
    setSaving(true);
    try {
      const latest = await detail.refetch();
      const latestAgent = latest.data;
      if (!latestAgent || !latestAgent.id) {
        throw new Error(t("edit.missing"));
      }
      if (
        decideAgentSave({
          baseUpdatedAt,
          latestUpdatedAt: latestAgent.updated_at,
          overwrite,
        }) === "conflict"
      ) {
        setSaving(false);
        Alert.alert(t("conflict.title"), t("conflict.message"), [
          {
            text: t("conflict.reload"),
            onPress: () => {
              resetFrom(latestAgent);
              Alert.alert(t("conflict.reload_done"));
            },
          },
          {
            text: t("conflict.overwrite"),
            style: "destructive",
            onPress: () => void save(true),
          },
        ]);
        return;
      }

      const patch: UpdateAgentRequest = {
        name: name.trim(),
        description: description.trim(),
      };
      if (supportsModel) {
        patch.model = model.trim();
        patch.thinking_level = thinking.trim();
      }
      if (showServiceTier) patch.service_tier = serviceTier.trim();

      await update.mutateAsync(patch);
      router.back();
    } catch (error) {
      Alert.alert(
        t("edit.save_failed", { message: messageOf(error) }),
      );
    } finally {
      setSaving(false);
    }
  };

  const onAvatarPress = () => {
    const actions = ["emoji", "library", "camera"];
    if (agent.avatar_url) actions.push("remove");
    actions.push("cancel");
    const removeIndex = agent.avatar_url ? 3 : -1;
    const cancelIndex = actions.length - 1;
    const options = actions.map((action) =>
      action === "emoji"
        ? t("edit.avatar_emoji")
        : action === "library"
          ? t("edit.avatar_library")
          : action === "camera"
            ? t("edit.avatar_take")
            : action === "remove"
              ? t("edit.avatar_remove")
              : t("common:actions.cancel"),
    );

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t("edit.avatar"),
        options,
        cancelButtonIndex: cancelIndex,
        destructiveButtonIndex: removeIndex >= 0 ? removeIndex : undefined,
      },
      (index) => {
        const action = actions[index];
        if (action === "emoji") setEmojiOpen(true);
        else if (action === "library") void pickImage(false);
        else if (action === "camera") void pickImage(true);
        else if (action === "remove") void saveAvatar(null);
      },
    );
  };

  const pickImage = async (camera: boolean) => {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t("edit.avatar_permission_title"),
          t("edit.avatar_permission_message"),
        );
        return;
      }
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_AVATAR_BYTES) {
      Alert.alert(
        t("edit.avatar_too_large_title"),
        t("edit.avatar_too_large_message"),
      );
      return;
    }
    setUploading(true);
    try {
      const file: FileAsset = {
        uri: asset.uri,
        name: asset.fileName ?? "agent-avatar.jpg",
        type: asset.mimeType ?? "image/jpeg",
      };
      const attachment = await api.uploadFile(file);
      await saveAvatar(attachment.url);
    } catch (error) {
      Alert.alert(t("edit.avatar_failed", { message: messageOf(error) }));
    } finally {
      setUploading(false);
    }
  };

  const saveAvatar = async (avatarUrl: string | null) => {
    try {
      const saved = await update.mutateAsync({ avatar_url: avatarUrl ?? "" });
      // Our own write moved `updated_at`; otherwise the next text save would
      // report a false conflict against the avatar write we just made.
      setBaseUpdatedAt(saved.updated_at);
    } catch (error) {
      Alert.alert(t("edit.avatar_failed", { message: messageOf(error) }));
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: t("edit.title"),
          headerRight: () => (
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty || saving || !name.trim()}
              onPress={() => void save()}
            >
              <Text>
                {saving ? t("edit.saving") : t("edit.save")}
              </Text>
            </Button>
          ),
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4 py-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center gap-2">
          <Pressable onPress={onAvatarPress} disabled={uploading}>
            <ActorAvatar
              type="agent"
              id={agent.id}
              name={name}
              avatarUrl={agent.avatar_url}
              size={88}
            />
            {uploading ? (
              <View className="absolute inset-0 items-center justify-center rounded-full bg-background/60">
                <ActivityIndicator />
              </View>
            ) : null}
          </Pressable>
          <Text className="text-xs text-muted-foreground">
            {t("edit.avatar_change")}
          </Text>
        </View>

        <Field label={t("edit.name")}>
          <TextField
            value={name}
            onChangeText={setName}
            placeholder={t("edit.name_placeholder")}
            autoCapitalize="words"
          />
        </Field>

        <Field label={t("edit.description")}>
          <AutosizeTextArea
            value={description}
            onChangeText={setDescription}
            placeholder={t("edit.description_placeholder")}
            minHeight={72}
            maxHeight={140}
            className="rounded-md border border-transparent bg-secondary/50 px-3 py-2"
          />
        </Field>

        {agent.runtime_id ? (
          <View className="gap-4">
            <Text className="text-sm font-semibold text-foreground">
              {t("edit.execution")}
            </Text>
            {supportsModel ? (
              <>
                <Field label={t("edit.model")}>
                  <TextField
                    value={model}
                    onChangeText={setModel}
                    placeholder={t("edit.model_placeholder")}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
                <Field label={t("edit.thinking")}>
                  <TextField
                    value={thinking}
                    onChangeText={setThinking}
                    placeholder={t("edit.thinking_placeholder")}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
              </>
            ) : null}
            {showServiceTier ? (
              <Field label={t("edit.service_tier")}>
                <TextField
                  value={serviceTier}
                  onChangeText={setServiceTier}
                  placeholder={t("edit.service_tier_placeholder")}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Field>
            ) : null}
            <Text className="text-xs text-muted-foreground">
              {t("edit.execution_hint")}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={emojiOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEmojiOpen(false)}
      >
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
          <View className="flex-row items-center justify-between px-4 py-3">
            <Text className="text-base font-semibold text-foreground">
              {t("edit.avatar_emoji")}
            </Text>
            <Button variant="ghost" size="sm" onPress={() => setEmojiOpen(false)}>
              <Text>{t("common:actions.close")}</Text>
            </Button>
          </View>
          <EmojiKeyboard
            onEmojiSelected={(picked: EmojiType) => {
              setEmojiOpen(false);
              void saveAvatar(`emoji:${picked.emoji}`);
            }}
            enableSearchBar
            enableRecentlyUsed
            categoryPosition="top"
            theme={{
              backdrop: theme.background,
              knob: theme.mutedForeground,
              container: theme.popover,
              header: theme.foreground,
              skinTonesContainer: theme.secondary,
              category: {
                icon: theme.mutedForeground,
                iconActive: theme.foreground,
                container: theme.popover,
                containerActive: theme.secondary,
              },
              search: {
                background: theme.secondary,
                text: theme.foreground,
                placeholder: theme.mutedForeground,
                icon: theme.mutedForeground,
              },
              customButton: {
                icon: theme.mutedForeground,
                iconPressed: theme.foreground,
                background: theme.secondary,
                backgroundPressed: theme.muted,
              },
              emoji: {
                selected: theme.secondary,
              },
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "unknown";
}
