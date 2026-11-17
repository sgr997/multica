/**
 * Create-agent modal.
 *
 * Required: name + runtime. Optional: description, avatar, initial
 * instructions. Runtime choices are limited to runtimes this member may bind
 * (`canBindRuntime`, same truth table as web/server) and must be online to
 * submit. On success the modal closes and the new agent's detail opens so the
 * user can chat immediately.
 */
import { useMemo, useState } from "react";
import {
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { RuntimeDevice } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { AutosizeTextArea } from "@/components/ui/autosize-textarea";
import { Button } from "@/components/ui/button";
import { PresenceDot } from "@/components/ui/presence-dot";
import { AgentAvatarButton } from "@/components/agents/agent-avatar-button";
import { agentRuntimeLabel } from "@/components/agents/agent-row";
import { runtimeListOptions } from "@/data/queries/runtimes";
import { useCreateAgent } from "@/data/mutations/agents";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  buildAgentCreateRequest,
  classifyAgentCreateError,
  isAgentCreateDraftDirty,
  isAgentCreateReady,
  validateAgentCreateForm,
} from "@/lib/agent-create-form";
import { bindableRuntimes } from "@/lib/runtime-access";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";
import { useT } from "@/lib/i18n";

export default function NewAgentScreen() {
  const { t } = useT("agents");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const create = useCreateAgent();
  const runtimes = useQuery(runtimeListOptions(wsId));

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [runtimeId, setRuntimeId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const bindable = useMemo(
    () => bindableRuntimes(runtimes.data ?? [], userId),
    [runtimes.data, userId],
  );
  const selectedRuntime =
    bindable.find((runtime) => runtime.id === runtimeId) ?? null;
  const onlineCount = bindable.filter(
    (runtime) => runtime.status === "online",
  ).length;

  const draft = { name, description, instructions, avatarUrl };
  const validation = validateAgentCreateForm({ name }, selectedRuntime, userId);
  const ready = isAgentCreateReady({ name }, selectedRuntime, userId);
  const dirty = isAgentCreateDraftDirty(draft, runtimeId);

  const messageOf = (error: unknown) =>
    error instanceof Error ? error.message : "unknown";

  const close = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(
      t("create.discard_title"),
      t("create.discard_message"),
      [
        { text: t("create.discard_keep"), style: "cancel" },
        {
          text: t("common:actions.discard"),
          style: "destructive",
          onPress: () => router.back(),
        },
      ],
    );
  };

  const submit = () => {
    setSubmitted(true);
    if (!ready || create.isPending || !selectedRuntime) return;
    setNameError(null);
    setFormError(null);
    create.mutate(
      buildAgentCreateRequest(draft, selectedRuntime.id),
      {
        onSuccess: (agent) => {
          const id = agent.id;
          router.back();
          InteractionManager.runAfterInteractions(() => {
            if (wsSlug) {
              router.push({
                pathname: "/[workspace]/agent/[id]",
                params: { workspace: wsSlug, id },
              });
            }
          });
        },
        onError: (error) => {
          const errors = classifyAgentCreateError(
            error,
            t("create.save_failed"),
            t("create.name_conflict"),
          );
          setNameError(errors.nameError);
          setFormError(errors.formError);
        },
      },
    );
  };

  const showNameError = submitted && validation.name !== null;
  const showRuntimeError =
    submitted && bindable.length > 0 && validation.runtime !== null;

  return (
    <>
      <Stack.Screen
        options={{
          title: t("create.title"),
          headerLeft: () => (
            <Pressable onPress={close} className="px-1 py-1">
              <Text className="text-base text-brand">
                {t("common:actions.cancel")}
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={submit}
              disabled={!ready || create.isPending}
              className={ready ? "px-1 py-1" : "px-1 py-1 opacity-40"}
            >
              <Text className="text-base font-semibold text-brand">
                {create.isPending ? t("create.creating") : t("create.submit")}
              </Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        className="flex-1 bg-background"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 px-4 py-5"
          keyboardShouldPersistTaps="handled"
        >
          <AgentAvatarButton
            name={name}
            avatarUrl={avatarUrl}
            label={t("create.avatar_hint")}
            onPicked={setAvatarUrl}
          />

          <Field label={t("create.name")}>
            <TextField
              value={name}
              onChangeText={(value) => {
                setName(value);
                setNameError(null);
              }}
              placeholder={t("create.name_placeholder")}
              autoCapitalize="words"
              autoFocus
              invalid={showNameError || !!nameError}
            />
            {showNameError ? (
              <Text className="text-xs text-destructive">
                {t("create.name_required")}
              </Text>
            ) : nameError ? (
              <Text className="text-xs text-destructive">{nameError}</Text>
            ) : null}
          </Field>

          <Field label={t("create.description")}>
            <AutosizeTextArea
              value={description}
              onChangeText={setDescription}
              placeholder={t("create.description_placeholder")}
              minHeight={64}
              maxHeight={120}
              className="rounded-md border border-transparent bg-secondary/50 px-3 py-2"
            />
          </Field>

          <View className="gap-1.5">
            <Text className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("create.runtime")}
            </Text>
            {runtimes.isLoading && !runtimes.data ? (
              <Text className="py-2 text-sm text-muted-foreground">
                {t("create.runtime_loading")}
              </Text>
            ) : bindable.length === 0 ? (
              <View className="rounded-lg border border-dashed border-border px-3 py-4">
                <Text className="text-sm font-medium text-foreground">
                  {t("create.runtime_empty_title")}
                </Text>
                <Text className="mt-1 text-xs text-muted-foreground">
                  {t("create.runtime_empty_message")}
                </Text>
              </View>
            ) : (
              <View className="overflow-hidden rounded-lg border border-border">
                {bindable.map((runtime, index) => (
                  <RuntimeOption
                    key={runtime.id}
                    runtime={runtime}
                    selected={runtime.id === runtimeId}
                    disabled={runtime.status !== "online"}
                    showDivider={index > 0}
                    checkColor={theme.brand}
                    idleColor={theme.mutedForeground}
                    onPress={() => {
                      setRuntimeId(runtime.id);
                      setFormError(null);
                    }}
                    offlineLabel={t("create.runtime_offline")}
                    onlineLabel={t("create.runtime_online")}
                  />
                ))}
              </View>
            )}
            {bindable.length > 0 && onlineCount === 0 ? (
              <Text className="text-xs text-warning">
                {t("create.runtime_all_offline")}
              </Text>
            ) : showRuntimeError ? (
              <Text className="text-xs text-destructive">
                {t("create.runtime_required")}
              </Text>
            ) : null}
          </View>

          <Field label={t("create.instructions")}>
            <AutosizeTextArea
              value={instructions}
              onChangeText={setInstructions}
              placeholder={t("create.instructions_placeholder")}
              minHeight={96}
              maxHeight={180}
              className="rounded-md border border-transparent bg-secondary/50 px-3 py-2"
            />
          </Field>

          {formError ? (
            <Text className="text-sm text-destructive">{formError}</Text>
          ) : null}

          {!ready && !submitted ? (
            <Text className="text-xs text-muted-foreground">
              {t("create.submit_hint")}
            </Text>
          ) : null}

          <Button
            onPress={submit}
            disabled={!ready || create.isPending}
            className="mt-1"
          >
            <Text>
              {create.isPending ? t("create.creating") : t("create.submit")}
            </Text>
          </Button>
          {runtimes.isError ? (
            <Text className="text-xs text-destructive">
              {t("create.runtime_load_failed", {
                message: messageOf(runtimes.error),
              })}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

function RuntimeOption({
  runtime,
  selected,
  disabled,
  showDivider,
  checkColor,
  idleColor,
  onPress,
  onlineLabel,
  offlineLabel,
}: {
  runtime: RuntimeDevice;
  selected: boolean;
  disabled: boolean;
  showDivider: boolean;
  checkColor: string;
  idleColor: string;
  onPress: () => void;
  onlineLabel: string;
  offlineLabel: string;
}) {
  const online = runtime.status === "online";
  return (
    <View>
      {showDivider ? <View className="ml-3 h-px bg-border" /> : null}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        className={
          disabled
            ? "flex-row items-center gap-3 px-3 py-3 opacity-50"
            : "flex-row items-center gap-3 px-3 py-3 active:bg-secondary"
        }
      >
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
            {agentRuntimeLabel(runtime) || runtime.provider}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <PresenceDot availability={online ? "online" : "offline"} size={7} />
            <Text className="text-xs text-muted-foreground">
              {online ? onlineLabel : offlineLabel}
            </Text>
            {runtime.provider ? (
              <Text className="text-xs text-muted-foreground">
                · {runtime.provider}
              </Text>
            ) : null}
          </View>
        </View>
        <Ionicons
          name={selected ? "checkmark-circle" : "ellipse-outline"}
          size={22}
          color={selected ? checkColor : idleColor}
        />
      </Pressable>
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
      <Text className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Text>
      {children}
    </View>
  );
}
