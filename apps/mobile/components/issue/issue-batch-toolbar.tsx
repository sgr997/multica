import { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useQuery } from "@tanstack/react-query";
import { commonIssueFields } from "@multica/core/issues/batch";
import type { Issue } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { useIssueSelectionStore } from "@/components/issue/issue-selection-store";
import { agentListOptions } from "@/data/queries/agents";
import { memberListOptions } from "@/data/queries/members";
import { useBatchDeleteIssues } from "@/data/mutations/issues";
import { useAuthStore } from "@/data/auth-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  batchWriteOutcome,
  canDeleteIssueSelection,
} from "@/lib/issue-batch";
import { useT } from "@/lib/i18n";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { cn } from "@/lib/utils";

const EMPTY_IDS: string[] = [];

type BatchPickerAction =
  | "status"
  | "priority"
  | "assignee";

const PICKER_PATH: Record<BatchPickerAction, `/[workspace]/batch-picker/${string}`> = {
  status: "/[workspace]/batch-picker/status",
  priority: "/[workspace]/batch-picker/priority",
  assignee: "/[workspace]/batch-picker/assignee",
};

export function IssueBatchToolbar({
  surface,
  issues,
}: {
  /** Selection surface key shared with the list rows and header. */
  surface: string;
  /** The visible universe the toolbar intersects its selection with. */
  issues: readonly Issue[];
}) {
  const selectedIds = useIssueSelectionStore(
    (state) => state.selections[surface] ?? EMPTY_IDS,
  );
  const feedback = useIssueSelectionStore(
    (state) => state.feedback[surface] ?? null,
  );
  const insets = useSafeAreaInsets();
  const selectedSet = new Set(selectedIds);
  const selectedIssues = issues.filter((issue) => selectedSet.has(issue.id));
  if (selectedIssues.length === 0) {
    if (!feedback) return null;
    return (
      <View
        pointerEvents="none"
        className="absolute left-0 right-0 bottom-0"
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        <BatchFeedbackBanner surface={surface} />
      </View>
    );
  }
  return (
    <IssueBatchToolbarContent
      surface={surface}
      selectedIssues={selectedIssues}
    />
  );
}

function IssueBatchToolbarContent({
  surface,
  selectedIssues,
}: {
  surface: string;
  selectedIssues: readonly Issue[];
}) {
  const { t } = useT("issues");
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const pending = useIssueSelectionStore((state) => state.pending[surface] ?? false);
  const setFeedback = useIssueSelectionStore((state) => state.setFeedback);
  const setPending = useIssueSelectionStore((state) => state.setPending);
  const clear = useIssueSelectionStore((state) => state.clear);
  const batchDelete = useBatchDeleteIssues();
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));

  const ids = selectedIssues.map((issue) => issue.id);
  const count = selectedIssues.length;
  const common = commonIssueFields(selectedIssues);
  const role = members.find((member) => member.user_id === userId)?.role ?? null;
  const canDelete = canDeleteIssueSelection(
    selectedIssues,
    userId,
    role,
    agents,
    ids.length,
  );

  const openPicker = (action: BatchPickerAction) => {
    if (!wsSlug || pending) return;
    router.push({
      pathname: PICKER_PATH[action],
      params: { workspace: wsSlug, surface },
    });
  };

  const copyLinks = () => {
    const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
    if (!webUrl || !wsSlug) return;
    const links = selectedIssues.map(
      (issue) => `${webUrl}/${wsSlug}/issue/${issue.identifier || issue.id}`,
    );
    void Clipboard.setStringAsync(links.join("\n"))
      .then(() => {
        setFeedback(surface, {
          kind: "success",
          messageKey: "batch.links_copied",
          params: { count },
        });
      })
      .catch(() => {
        setFeedback(surface, {
          kind: "error",
          messageKey: "batch.copy_failed",
        });
      });
  };

  const confirmDelete = () => {
    if (!canDelete || pending) {
      Alert.alert(t("batch.delete"), t("batch.delete_restricted"));
      return;
    }
    Alert.alert(
      t("batch.delete_dialog_title", { count }),
      t("batch.delete_dialog_desc", { count }),
      [
        { text: t("batch.cancel"), style: "cancel" },
        {
          text: t("batch.delete"),
          style: "destructive",
          onPress: () => {
            setPending(surface, true);
            void batchDelete
              .mutateAsync(ids)
              .then(({ deleted }) => {
                const outcome = batchWriteOutcome(deleted, ids.length);
                if (outcome === "success") {
                  clear(surface);
                  setFeedback(surface, {
                    kind: "success",
                    messageKey: "batch.delete_success",
                    params: { count: deleted },
                  });
                } else {
                  setFeedback(surface, {
                    kind: "warning",
                    messageKey: "batch.delete_partial",
                    params: { deleted, count: ids.length },
                  });
                }
              })
              .catch((error: unknown) => {
                setFeedback(surface, {
                  kind: "error",
                  messageKey: "batch.delete_failed",
                  message: error instanceof Error ? error.message : undefined,
                });
              })
              .finally(() => setPending(surface, false));
          },
        },
      ],
    );
  };

  const tint = THEME[colorScheme].foreground;
  const destructive = THEME[colorScheme].destructive;

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 bottom-0"
    >
      <BatchFeedbackBanner surface={surface} />
      <View
        className={cn(
          "border-t border-border bg-background/95 px-2 pt-2",
          pending && "opacity-60",
        )}
        style={{ paddingBottom: Math.max(insets.bottom, 8) }}
      >
        {pending ? (
          <View className="flex-row items-center justify-center gap-2 pb-2">
            <ActivityIndicator size="small" />
            <Text className="text-xs text-muted-foreground">
              {t("batch.applying")}
            </Text>
          </View>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-1 px-1"
        >
          <BatchAction
            icon="ellipse-outline"
            label={t("batch.status")}
            disabled={pending}
            onPress={() => openPicker("status")}
            tint={
              common.status
                ? THEME[colorScheme].mutedForeground
                : tint
            }
          />
          <BatchAction
            icon="flag-outline"
            label={t("batch.priority")}
            disabled={pending}
            onPress={() => openPicker("priority")}
            tint={tint}
          />
          <BatchAction
            icon="person-outline"
            label={t("batch.assignee")}
            disabled={pending}
            onPress={() => openPicker("assignee")}
            tint={tint}
          />
          <BatchAction
            icon="link-outline"
            label={t("batch.copy_links")}
            disabled={pending}
            onPress={copyLinks}
            tint={tint}
          />
          <BatchAction
            icon="trash-outline"
            label={t("batch.delete")}
            disabled={pending}
            dimmed={!canDelete}
            onPress={confirmDelete}
            tint={destructive}
          />
        </ScrollView>
      </View>
    </View>
  );
}

function BatchFeedbackBanner({ surface }: { surface: string }) {
  const { t } = useT("issues");
  const feedback = useIssueSelectionStore(
    (state) => state.feedback[surface] ?? null,
  );
  const setFeedback = useIssueSelectionStore((state) => state.setFeedback);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(surface, null), 4000);
    return () => clearTimeout(timer);
  }, [feedback, setFeedback, surface]);

  if (!feedback) return null;
  return (
    <View
      className={cn(
        "mx-4 mb-2 rounded-xl px-3 py-2",
        feedback.kind === "success"
          ? "bg-emerald-600"
          : feedback.kind === "warning"
            ? "bg-amber-600"
            : "bg-destructive",
      )}
    >
      <Text className="text-sm text-white">
        {feedback.messageKey
          ? t(feedback.messageKey, feedback.params)
          : feedback.message ?? t("batch.update_failed")}
      </Text>
    </View>
  );
}

function BatchAction({
  icon,
  label,
  onPress,
  disabled,
  dimmed = false,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled: boolean;
  dimmed?: boolean;
  tint: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || dimmed }}
      className={cn(
        "min-w-16 items-center gap-1 rounded-lg px-2 py-1.5 active:bg-secondary",
        (disabled || dimmed) && "opacity-40",
      )}
    >
      <Ionicons name={icon} size={20} color={tint} />
      <Text className="text-[11px] text-foreground">{label}</Text>
    </Pressable>
  );
}
