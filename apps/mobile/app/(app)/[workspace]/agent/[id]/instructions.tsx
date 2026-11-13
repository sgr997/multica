/**
 * Full-screen instructions editor.
 *
 * Long prompts need the whole screen, so this route hides the native header
 * and owns its chrome: a top bar (close / title), the editor, and a bottom
 * save bar. The keyboard accessory mirrors the two actions people reach for
 * while typing — Preview and Done.
 *
 * Drafts live in `agent-instructions-draft-store`, keyed by agent id, so
 * leaving the screen (including a back-swipe attempt) does not lose text
 * within the app session. Leaving with unsaved changes asks first.
 */
import { useState } from "react";
import {
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { Agent } from "@multica/core/types";
import { agentDetailOptions } from "@/data/queries/agents";
import { useUpdateAgent } from "@/data/mutations/agents";
import { useAgentInstructionsDraftStore } from "@/data/stores/agent-instructions-draft-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/lib/markdown";
import { decideAgentSave } from "@/lib/agent-save-conflict";
import { useT } from "@/lib/i18n";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";

const TOOLBAR_ID = "agent-instructions-toolbar";

export default function AgentInstructionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const detail = useQuery(agentDetailOptions(wsId, id));
  const agent = detail.data && detail.data.id ? detail.data : null;
  const { t } = useT("agents");

  if (!agent) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-background px-8">
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Text className="text-center text-sm text-muted-foreground">
          {t("edit.missing")}
        </Text>
      </SafeAreaView>
    );
  }

  return <InstructionsEditor agent={agent} detail={detail} />;
}

function InstructionsEditor({
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
  const draft = useAgentInstructionsDraftStore((s) => s.drafts[agent.id]);
  const setDraft = useAgentInstructionsDraftStore((s) => s.setDraft);
  const clearDraft = useAgentInstructionsDraftStore((s) => s.clearDraft);

  const [content, setContent] = useState(draft?.content ?? agent.instructions);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(
    draft?.baseUpdatedAt ?? agent.updated_at,
  );
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = content !== agent.instructions;

  const onChange = (next: string) => {
    setContent(next);
    setDraft(agent.id, next, baseUpdatedAt);
  };

  const close = () => {
    if (!dirty) {
      clearDraft(agent.id);
      router.back();
      return;
    }
    Alert.alert(t("instructions.discard_title"), t("instructions.discard_message"), [
      { text: t("instructions.discard_keep"), style: "cancel" },
      {
        text: t("instructions.discard_confirm"),
        style: "destructive",
        onPress: () => {
          clearDraft(agent.id);
          router.back();
        },
      },
    ]);
  };

  const save = async (overwrite = false) => {
    if (saving) return;
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
              setContent(latestAgent.instructions);
              setBaseUpdatedAt(latestAgent.updated_at);
              clearDraft(agent.id);
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
      await update.mutateAsync({ instructions: content });
      clearDraft(agent.id);
      router.back();
    } catch (error) {
      Alert.alert(
        t("edit.save_failed", {
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const togglePreview = () => {
    Keyboard.dismiss();
    setPreview((value) => !value);
  };

  const done = () => {
    if (dirty) void save();
    else close();
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row items-center gap-3 border-b border-border px-3 py-2">
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={t("common:actions.close")}
            className="size-9 items-center justify-center rounded-md active:bg-secondary"
          >
            <Ionicons name="close" size={20} color={theme.foreground} />
          </Pressable>
          <Text className="flex-1 text-base font-semibold text-foreground">
            {t("instructions.title")}
          </Text>
          <Button variant="ghost" size="sm" onPress={togglePreview}>
            <Text>
              {preview ? t("instructions.edit") : t("instructions.preview")}
            </Text>
          </Button>
        </View>

        {preview ? (
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-4 py-4"
            keyboardShouldPersistTaps="handled"
          >
            {content.trim() ? (
              <Markdown content={content} />
            ) : (
              <Text className="text-sm text-muted-foreground">
                {t("instructions.preview_empty")}
              </Text>
            )}
          </ScrollView>
        ) : (
          <TextInput
            value={content}
            onChangeText={onChange}
            placeholder={t("instructions.placeholder")}
            placeholderTextColor={theme.mutedForeground}
            multiline
            autoFocus
            textAlignVertical="top"
            inputAccessoryViewID={Platform.OS === "ios" ? TOOLBAR_ID : undefined}
            className="flex-1 px-4 py-4 text-base text-foreground"
            style={{ fontSize: 16, lineHeight: 22 }}
          />
        )}

        <View className="flex-row items-center justify-between border-t border-border px-4 py-2">
          <Text
            className={`text-xs ${dirty ? "text-warning" : "text-muted-foreground"}`}
          >
            {dirty ? t("instructions.dirty") : t("instructions.clean")}
          </Text>
          <Button
            size="sm"
            disabled={!dirty || saving}
            onPress={() => void save()}
          >
            <Text>{saving ? t("instructions.saving") : t("common:actions.save")}</Text>
          </Button>
        </View>
      </KeyboardAvoidingView>

      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={TOOLBAR_ID}>
          <View
            className="flex-row items-center justify-end gap-2 border-t border-border px-3 py-2"
            style={{ backgroundColor: theme.popover }}
          >
            <Button variant="ghost" size="sm" onPress={togglePreview}>
              <Text>
                {preview ? t("instructions.edit") : t("instructions.preview")}
              </Text>
            </Button>
            <Button size="sm" onPress={done}>
              <Text>{t("instructions.done")}</Text>
            </Button>
          </View>
        </InputAccessoryView>
      ) : null}
    </SafeAreaView>
  );
}
