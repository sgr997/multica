/**
 * Squad profile editor (name / description / avatar). Mirrors the editable
 * identity block on web's squad detail page; member management stays on the
 * detail screen.
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { Squad } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { AutosizeTextArea } from "@/components/ui/autosize-textarea";
import { MOBILE_PLACEHOLDER_COLOR } from "@/components/ui/input-tokens";
import { AgentAvatarButton } from "@/components/agents/agent-avatar-button";
import { squadDetailOptions } from "@/data/queries/squads";
import { useUpdateSquad } from "@/data/mutations/squads";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useT } from "@/lib/i18n";

export default function EditSquadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("squads");
  const { t: tCommon } = useT("common");
  const detail = useQuery(squadDetailOptions(wsId, id));

  const squad = detail.data && detail.data.id ? detail.data : null;

  return (
    <View className="flex-1 bg-background">
      {detail.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !squad ? (
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-center text-sm text-destructive">
            {t("detail.load_failed")}
          </Text>
          <Button variant="outline" onPress={() => detail.refetch()}>
            <Text>{tCommon("actions.retry")}</Text>
          </Button>
        </View>
      ) : (
        <SquadEditForm squad={squad} />
      )}
    </View>
  );
}

function SquadEditForm({
  squad,
}: {
  squad: Squad;
}) {
  const { t } = useT("squads");
  const { t: tCommon } = useT("common");
  const update = useUpdateSquad(squad.id);
  const [name, setName] = useState(squad.name);
  const [description, setDescription] = useState(squad.description ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    squad.avatar_url ?? null,
  );

  const canSave = name.trim().length > 0 && !update.isPending;

  const save = useCallback(() => {
    if (!canSave) return;
    const patch: {
      name: string;
      description: string;
      avatar_url?: string;
    } = {
      name: name.trim(),
      description: description.trim(),
    };
    if ((squad.avatar_url ?? null) !== avatarUrl) {
      patch.avatar_url = avatarUrl ?? "";
    }
    update.mutate(patch, {
      onSuccess: () => router.back(),
      onError: (error) =>
        Alert.alert(
          t("edit.save_failed"),
          error instanceof Error ? error.message : tCommon("states.error"),
        ),
    });
  }, [avatarUrl, canSave, description, name, squad.avatar_url, t, tCommon, update]);

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={save}
              disabled={!canSave}
              className={canSave ? "px-1 py-1" : "px-1 py-1 opacity-40"}
            >
              <Text className="text-base font-semibold text-brand">
                {update.isPending ? t("edit.saving") : t("edit.save")}
              </Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerClassName="px-4 pt-5 pb-10 gap-5"
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center">
          <AgentAvatarButton
            actorType="squad"
            name={name}
            avatarUrl={avatarUrl}
            size={88}
            label={t("detail.edit")}
            onPicked={setAvatarUrl}
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-medium text-muted-foreground">
            {t("form.name")}
          </Text>
          <AutosizeTextArea
            value={name}
            onChangeText={setName}
            placeholder={t("form.name_placeholder")}
            placeholderTextColor={MOBILE_PLACEHOLDER_COLOR}
            minHeight={44}
            maxLength={120}
            className="rounded-md bg-secondary/50 px-3 py-2.5 text-base text-foreground"
          />
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-medium text-muted-foreground">
            {t("form.description")}
          </Text>
          <AutosizeTextArea
            value={description}
            onChangeText={setDescription}
            placeholder={t("form.description_placeholder")}
            placeholderTextColor={MOBILE_PLACEHOLDER_COLOR}
            minHeight={100}
            maxLength={2000}
            className="rounded-md bg-secondary/50 px-3 py-2.5 text-sm leading-5 text-foreground"
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
