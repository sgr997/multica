/**
 * Queued follow-ups for the active chat session, rendered directly above
 * the composer.
 *
 * Mirrors web's `packages/views/chat/components/chat-queue.tsx`, trimmed to
 * the actions a phone needs: steer a row now, or delete it. The head status
 * gates steering — a task the server has not claimed yet has nothing to
 * interrupt.
 */
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ChatQueuedTask } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { canSteerQueuedTask } from "@/lib/chat-queue";
import { useT } from "@/lib/i18n";

interface Props {
  tasks: ChatQueuedTask[];
  /** Status of the task currently owning the session. */
  headStatus?: string;
  /** Composer-level hard disable (no agent / revoked / archived). */
  disabled?: boolean;
  onSteer: (taskId: string) => Promise<void> | void;
  onRemove: (taskId: string) => Promise<void> | void;
  onClear: () => Promise<void> | void;
}

export function ChatQueue({
  tasks,
  headStatus,
  disabled = false,
  onSteer,
  onRemove,
  onClear,
}: Props) {
  const { t } = useT("chat");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const [busy, setBusy] = useState<string | null>(null);
  const canSteer = !disabled && canSteerQueuedTask(headStatus);

  const run = useCallback(
    async (key: string, action: () => Promise<void> | void) => {
      setBusy(key);
      try {
        await action();
      } finally {
        setBusy((current) => (current === key ? null : current));
      }
    },
    [],
  );

  if (tasks.length === 0) return null;

  return (
    <View
      className="mx-3 mb-1 overflow-hidden rounded-xl border border-border bg-secondary/50"
      accessibilityLiveRegion="polite"
    >
      <View className="flex-row items-center justify-between px-3 py-1.5">
        <Text className="text-[11px] font-medium text-muted-foreground">
          {t("queue.title", { count: tasks.length })}
        </Text>
        <Pressable
          onPress={() => void run("clear", onClear)}
          disabled={busy !== null}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("queue.clear")}
          className="active:opacity-60"
        >
          <Text className="text-[11px] text-muted-foreground">
            {t("queue.clear")}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        style={{ maxHeight: 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {tasks.map((task) => {
          const steerKey = `steer:${task.task_id}`;
          const removeKey = `remove:${task.task_id}`;
          return (
            <View
              key={task.task_id}
              className="flex-row items-center gap-2 px-3 py-1"
            >
              <Ionicons
                name="return-down-forward"
                size={13}
                color={theme.mutedForeground}
              />
              <Text
                className="flex-1 text-xs text-muted-foreground"
                numberOfLines={1}
              >
                {task.content?.trim() || t("queue.fallback")}
              </Text>
              <Pressable
                onPress={() => void run(steerKey, () => onSteer(task.task_id))}
                disabled={busy !== null || !canSteer}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("queue.steer")}
                accessibilityState={{ disabled: busy !== null || !canSteer }}
                className="px-1.5 py-0.5 active:opacity-60"
              >
                {busy === steerKey ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Text
                    className={cn(
                      "text-xs font-medium",
                      canSteer ? "text-primary" : "text-muted-foreground/50",
                    )}
                  >
                    {t("queue.steer")}
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => void run(removeKey, () => onRemove(task.task_id))}
                disabled={busy !== null}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t("queue.remove")}
                accessibilityState={{ disabled: busy !== null }}
                className="active:opacity-60"
              >
                {busy === removeKey ? (
                  <ActivityIndicator size="small" color={theme.mutedForeground} />
                ) : (
                  <Ionicons
                    name="trash-outline"
                    size={14}
                    color={theme.mutedForeground}
                  />
                )}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
