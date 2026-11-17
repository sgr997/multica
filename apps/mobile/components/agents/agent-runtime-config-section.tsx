/**
 * Advanced runtime block: editable custom_args + max_concurrent_tasks, plus a
 * read-only summary of the rest.
 *
 * `runtime_config` is deliberately read-only. It can contain gateway tokens;
 * the server masks them with `***` on read and preserves the stored value on
 * write, so round-tripping the whole object from a phone would be one parse
 * bug away from writing a mask over a real secret. Advanced parameters stay
 * on web, where the dedicated editors live.
 *
 * `custom_args` gets only a local sanity check (trim / non-empty / range).
 * The server's `ValidateCustomArgs` owns provider-specific flags and its error
 * message is shown verbatim.
 */
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import type { Agent, RuntimeDevice } from "@multica/core/types";
import {
  AGENT_MAX_CONCURRENT_TASKS_MAX,
  AGENT_MAX_CONCURRENT_TASKS_MIN,
} from "@multica/core/agents/constants";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useUpdateAgent } from "@/data/mutations/agents";
import { agentKeys } from "@/data/queries/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  buildRuntimeConfigPatch,
  clampConcurrency,
  type AgentRuntimeConfigDraft,
  validateRuntimeConfigDraft,
} from "@/lib/agent-runtime-config";
import { cn } from "@/lib/utils";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";
import { useT } from "@/lib/i18n";

export function AgentRuntimeConfigSection({
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
  const update = useUpdateAgent(agent.id);
  const qc = useQueryClient();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const persisted: AgentRuntimeConfigDraft = {
    customArgs: agent.custom_args,
    maxConcurrentTasks: agent.max_concurrent_tasks,
  };
  const persistedKey = `${persisted.customArgs.join("\u0000")}|${persisted.maxConcurrentTasks}`;

  const [args, setArgs] = useState<string[]>(persisted.customArgs);
  const [concurrency, setConcurrency] = useState(persisted.maxConcurrentTasks);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftKeyRef = useRef<string | null>(null);

  // Accept authoritative server updates (save response / another editor)
  // unless this screen already owns a newer draft.
  useEffect(() => {
    if (persistedKey === draftKeyRef.current) return;
    if (draftKeyRef.current && saving) return;
    draftKeyRef.current = persistedKey;
    setArgs(agent.custom_args);
    setConcurrency(agent.max_concurrent_tasks);
    setSaved(false);
  }, [persistedKey, agent.custom_args, agent.max_concurrent_tasks, saving]);

  const draft: AgentRuntimeConfigDraft = {
    customArgs: args,
    maxConcurrentTasks: concurrency,
  };
  const validation = validateRuntimeConfigDraft(draft);
  const dirty =
    args.join("\u0000") !== persisted.customArgs.join("\u0000") ||
    concurrency !== persisted.maxConcurrentTasks;

  const commitArgs = (next: string[]) => {
    draftKeyRef.current = persistedKey;
    setArgs(next);
    setSaved(false);
    setError(null);
  };

  const promptArg = (index: number | null) => {
    Alert.prompt(
      index === null ? t("runtime.add_arg_title") : t("runtime.edit_arg_title"),
      t("runtime.arg_prompt_message"),
      (value?: string) => {
        const text = value ?? "";
        if (!text.trim()) return;
        const next = [...args];
        if (index === null) next.push(text);
        else next[index] = text;
        commitArgs(next);
      },
      "plain-text",
      index === null ? "" : (args[index] ?? ""),
    );
  };

  const moveArg = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= args.length) return;
    const next = [...args];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    commitArgs(next);
  };

  const removeArg = (index: number) => {
    commitArgs(args.filter((_, i) => i !== index));
  };

  const changeConcurrency = (delta: number) => {
    draftKeyRef.current = persistedKey;
    setConcurrency((value) => clampConcurrency(value + delta));
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    if (saving || validation || !dirty) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await update.mutateAsync(buildRuntimeConfigPatch(draft));
      // Adopt the server's canonical args (trimmed) so the drift effect does
      // not immediately clear the saved state.
      draftKeyRef.current = `${updated.custom_args.join("\u0000")}|${updated.max_concurrent_tasks}`;
      setArgs(updated.custom_args);
      setConcurrency(updated.max_concurrent_tasks);
      setSaved(true);
      // Runtime-facing labels elsewhere on the screen (identity block, runs)
      // read the authoritative row, not this draft.
      void qc.invalidateQueries({ queryKey: agentKeys.detail(wsId, agent.id) });
      void qc.invalidateQueries({ queryKey: agentKeys.tasks(wsId, agent.id) });
    } catch (cause) {
      // Server ValidateCustomArgs message goes through verbatim.
      setError(cause instanceof Error ? cause.message : "unknown");
    } finally {
      setSaving(false);
    }
  };

  const validationMessage = validation
    ? t(
        validation.kind === "empty_arg"
          ? "runtime.errors.empty_arg"
          : "runtime.errors.concurrency_range",
        {
          min: AGENT_MAX_CONCURRENT_TASKS_MIN,
          max: AGENT_MAX_CONCURRENT_TASKS_MAX,
        },
      )
    : null;

  const command = runtime?.launch_header
    ? [runtime.launch_header, ...args.map(formatArgForPreview)].join(" ")
    : null;

  return (
    <View className="border-t border-border px-4 py-4">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("runtime.title")}
        </Text>
        <Text className="text-[10px] font-medium text-muted-foreground">
          {t("runtime.advanced_badge")}
        </Text>
      </View>

      {!canEdit ? (
        <>
          <ReadOnlyRow
            label={t("runtime.custom_args")}
            value={
              args.length > 0
                ? args.join(" ")
                : t("runtime.custom_args_empty")
            }
            mono
          />
          <ReadOnlyRow
            label={t("runtime.max_concurrency")}
            value={String(concurrency)}
          />
        </>
      ) : (
        <>
          <View className="mb-1 flex-row items-baseline justify-between">
            <Text className="text-xs font-medium text-muted-foreground">
              {t("runtime.custom_args")}
            </Text>
            <Pressable onPress={() => promptArg(null)} hitSlop={8}>
              <Text className="text-xs font-medium text-brand">
                {t("runtime.add_arg")}
              </Text>
            </Pressable>
          </View>

          {args.length === 0 ? (
            <Pressable
              onPress={() => promptArg(null)}
              className="rounded-lg border border-dashed border-border px-3 py-3"
            >
              <Text className="text-xs text-muted-foreground">
                {t("runtime.custom_args_empty")}
              </Text>
            </Pressable>
          ) : (
            <View className="overflow-hidden rounded-lg border border-border">
              {args.map((arg, index) => (
                <View key={`${index}:${arg}`}>
                  {index > 0 ? <View className="ml-3 h-px bg-border" /> : null}
                  <View className="flex-row items-center gap-1.5 px-3 py-2">
                    <Pressable
                      onPress={() => promptArg(index)}
                      className="min-w-0 flex-1"
                      hitSlop={4}
                    >
                      <Text className="font-mono text-xs text-foreground">
                        {arg}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => moveArg(index, -1)}
                      disabled={index === 0}
                      hitSlop={6}
                      accessibilityLabel={t("runtime.move_up", { arg })}
                      className={cn("p-1", index === 0 && "opacity-30")}
                    >
                      <Ionicons
                        name="chevron-up"
                        size={16}
                        color={theme.mutedForeground}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => moveArg(index, 1)}
                      disabled={index === args.length - 1}
                      hitSlop={6}
                      accessibilityLabel={t("runtime.move_down", { arg })}
                      className={cn(
                        "p-1",
                        index === args.length - 1 && "opacity-30",
                      )}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={theme.mutedForeground}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => removeArg(index)}
                      hitSlop={6}
                      accessibilityLabel={t("runtime.remove_arg", { arg })}
                      className="p-1"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={theme.destructive}
                      />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {command ? (
            <Text
              className="mt-1.5 font-mono text-[10px] text-muted-foreground"
              numberOfLines={2}
            >
              {command}
            </Text>
          ) : null}

          <View className="mt-4 flex-row items-center justify-between">
            <View className="min-w-0 flex-1">
              <Text className="text-xs font-medium text-muted-foreground">
                {t("runtime.max_concurrency")}
              </Text>
              <Text className="mt-0.5 text-xs text-muted-foreground">
                {t("runtime.max_concurrency_hint")}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => changeConcurrency(-1)}
                disabled={concurrency <= AGENT_MAX_CONCURRENT_TASKS_MIN}
                hitSlop={6}
                accessibilityLabel={t("runtime.decrease")}
                className={cn(
                  "size-8 items-center justify-center rounded-md border border-border",
                  concurrency <= AGENT_MAX_CONCURRENT_TASKS_MIN && "opacity-30",
                )}
              >
                <Ionicons name="remove" size={16} color={theme.foreground} />
              </Pressable>
              <Text className="w-7 text-center text-sm font-medium text-foreground">
                {concurrency}
              </Text>
              <Pressable
                onPress={() => changeConcurrency(1)}
                disabled={concurrency >= AGENT_MAX_CONCURRENT_TASKS_MAX}
                hitSlop={6}
                accessibilityLabel={t("runtime.increase")}
                className={cn(
                  "size-8 items-center justify-center rounded-md border border-border",
                  concurrency >= AGENT_MAX_CONCURRENT_TASKS_MAX && "opacity-30",
                )}
              >
                <Ionicons name="add" size={16} color={theme.foreground} />
              </Pressable>
            </View>
          </View>

          {validationMessage ? (
            <Text className="mt-2 text-xs text-destructive">
              {validationMessage}
            </Text>
          ) : null}
          {error ? (
            <Text className="mt-2 text-xs text-destructive">
              {t("runtime.save_failed", { message: error })}
            </Text>
          ) : null}
          {saved && !dirty ? (
            <Text className="mt-2 text-xs text-muted-foreground">
              {t("runtime.saved")}
            </Text>
          ) : null}

          <Button
            size="sm"
            variant="outline"
            className="mt-3 self-start"
            disabled={!dirty || saving || !!validation}
            onPress={() => void save()}
          >
            <Text>{saving ? t("runtime.saving") : t("runtime.save")}</Text>
          </Button>
        </>
      )}

      <View className="mt-4 gap-1 rounded-lg bg-muted px-3 py-2.5">
        <ReadOnlyRow
          label={t("runtime.readonly.provider")}
          value={runtime?.provider || t("detail.unknown")}
          mono={!!runtime?.provider}
          compact
        />
        <ReadOnlyRow
          label={t("runtime.readonly.model")}
          value={agent.model || t("detail.runtime_default")}
          mono={!!agent.model}
          compact
        />
        <ReadOnlyRow
          label={t("runtime.readonly.thinking")}
          value={agent.thinking_level || t("detail.runtime_default")}
          mono={!!agent.thinking_level}
          compact
        />
        {agent.service_tier ? (
          <ReadOnlyRow
            label={t("runtime.readonly.service_tier")}
            value={agent.service_tier}
            mono
            compact
          />
        ) : null}
        <Text className="mt-1 text-[11px] leading-4 text-muted-foreground">
          {t("runtime.readonly.hint")}
        </Text>
      </View>
    </View>
  );
}

function formatArgForPreview(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

function ReadOnlyRow({
  label,
  value,
  mono,
  compact,
}: {
  label: string;
  value: string;
  mono?: boolean;
  compact?: boolean;
}) {
  return (
    <View className={cn("flex-row items-baseline gap-2", compact ? "py-0.5" : "py-1.5")}>
      <Text className="w-24 text-xs text-muted-foreground">{label}</Text>
      <Text
        className={cn(
          "min-w-0 flex-1 text-foreground",
          compact ? "text-xs" : "text-sm",
          mono && "font-mono text-xs",
        )}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}
