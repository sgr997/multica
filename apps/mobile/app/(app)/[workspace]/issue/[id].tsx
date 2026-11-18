/**
 * Issue detail screen.
 *
 * Read-mostly timeline with an inline comment composer pinned to the
 * bottom (`<InlineCommentComposer>`). The composer is a single
 * `<TextInput>` + mention suggestion bar — no modal route, no toolbar,
 * no draft persistence. Sticks to the keyboard via `KeyboardStickyView`.
 *
 * Header note: the parent _layout.tsx already declares the `issue/[id]`
 * Stack.Screen with title "Issue". We override that here once the data
 * lands so the navigation bar shows `MUL-123` (Linear-style).
 */
import { useCallback, useEffect, useMemo } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  View,
} from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import type { Issue } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { TimelineList } from "@/components/issue/timeline-list";
import { AgentHeaderBadge } from "@/components/issue/agent-header-badge";
import { InlineCommentComposer } from "@/components/issue/inline-comment-composer";
import {
  issueDetailOptions,
  issueKeys,
  issueTimelineOptions,
} from "@/data/queries/issues";
import { ApiError } from "@/data/api";
import { useDeleteIssue } from "@/data/mutations/issues";
import { useCompleteInboxIssue } from "@/data/mutations/inbox-complete";
import { pinListOptions } from "@/data/queries/pins";
import { memberListOptions } from "@/data/queries/members";
import { useCreatePin, useDeletePin } from "@/data/mutations/pins";
import { useAuthStore } from "@/data/auth-store";
import { useIssueRealtime } from "@/data/realtime/use-issue-realtime";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useViewedIssuesStore } from "@/data/viewed-issues-store";
import { useReplyTargetStore } from "@/data/stores/reply-target-store";
import { useRefreshWithHaptics } from "@/lib/use-refresh-with-haptics";
import {
  beginTimelineOffsetGuard,
  requestTimelineScrollToTop,
  requestTimelineOffsetRestore,
} from "@/lib/timeline-offset-restore";
import { canEditIssue } from "@/lib/issue-permissions";
import { shouldShowInboxCompleteButton } from "@/lib/inbox-complete";
import { useInboxToastStore } from "@/data/inbox-toast-store";
import { useT } from "@/lib/i18n";
import { getWebBaseUrl } from "@/lib/runtime-config";

export default function IssueDetail() {
  // `highlight` + `h` come from inbox deep-link (apps/mobile/app/(app)/
  // [workspace]/(tabs)/inbox.tsx). `highlight` is the target comment id;
  // `h` is a per-tap nonce so re-tapping the same row re-fires the
  // scroll-and-flash effect. `from=inbox` marks the entry point: a running
  // issue then opens at the newest timeline row instead of the top.
  const {
    id,
    workspace: wsSlug,
    highlight,
    h,
    from,
  } = useLocalSearchParams<{
    id: string;
    workspace: string;
    highlight?: string;
    h?: string;
    from?: string;
  }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const qc = useQueryClient();

  const detail = useQuery(issueDetailOptions(wsId, id));
  const timeline = useQuery(issueTimelineOptions(wsId, id));

  // Subscribe to per-issue WS events: status/priority/assignee/label
  // changes, comments, activity, reactions, agent task progress.
  // Mounted with `id` — cleans up automatically on navigate-away.
  // If another client deletes the issue we're viewing, pop back so the
  // user isn't stranded on a 404 detail page.
  useIssueRealtime(id, () => router.back());

  // Track viewed issues so the chat composer's `@` suggestion bar can
  // surface "Recent" — the user just looked at MUL-123, likely wants to
  // ask the agent about it next. Workspace-scoped + in-memory; see
  // data/viewed-issues-store.ts.
  useEffect(() => {
    if (wsId && id) {
      useViewedIssuesStore.getState().push(wsId, id);
    }
  }, [wsId, id]);

  // Screen-scoped composer state — clear on unmount so re-entering the
  // issue starts from a clean slate (no stale "Replying to X" target).
  // The store is a singleton used by the long-press action sheet.
  useEffect(() => {
    return () => {
      useReplyTargetStore.getState().clear();
    };
  }, []);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      detail.refetch(),
      qc.invalidateQueries({ queryKey: issueKeys.timeline(wsId, id) }),
    ]);
  }, [detail, qc, wsId, id]);
  const {
    refreshing: refreshingManually,
    onRefresh: onRefreshWithHaptics,
  } = useRefreshWithHaptics(onRefresh);

  const issue = detail.data;
  const deleteIssue = useDeleteIssue();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const role = members.find((member) => member.user_id === userId)?.role ?? null;
  const canEdit = canEditIssue(userId, role);
  const { complete, retryArchive } = useCompleteInboxIssue(id);
  const completeIssue = complete.mutate;
  const retryArchiveIssue = retryArchive.mutate;
  const { data: pins } = useQuery(pinListOptions(wsId, userId));
  const isPinned =
    !!issue &&
    !!pins?.some((p) => p.item_type === "issue" && p.item_id === issue.id);
  const createPin = useCreatePin();
  const deletePin = useDeletePin();
  const { t } = useT("issues");

  // Three-dot menu: Pin/Unpin / Copy link / Open on web (if web URL set) /
  // Delete. Mirrors apps/mobile/app/(app)/[workspace]/project/[id].tsx — same
  // ActionSheetIOS + Alert.alert confirm pattern. Property edits (status,
  // priority, assignee, due_date) live on the IssueHeaderCard chips inside
  // the timeline list, not in this menu — one entry per action.
  const onPressMore = useCallback(() => {
    if (!issue || !wsSlug) return;
    // Presenting the sheet can unwind the timeline's offset before the sheet
    // is even visible. Open the guard on press so that unwind is treated as a
    // reset instead of the reader's new position.
    beginTimelineOffsetGuard();
    const webUrl = getWebBaseUrl();
    const issueLink = webUrl
      ? `${webUrl}/${wsSlug}/issue/${issue.identifier}`
      : null;
    const actions = ["cancel", "pin"];
    if (isPinned) actions[1] = "unpin";
    actions.push("edit");
    if (issueLink) actions.push("copy_link");
    if (issueLink) actions.push("open_web");
    actions.push("delete");
    const options = actions.map((action) =>
      action === "cancel"
        ? t("common:actions.cancel")
        : action === "pin"
          ? t("menu.pin")
          : action === "unpin"
            ? t("menu.unpin")
            : action === "edit"
              ? t("menu.edit_details")
              : action === "copy_link"
                ? t("menu.copy_link")
                : action === "open_web"
                  ? t("menu.open_web")
                  : t("menu.delete_issue"),
    );
    const destructiveIndex = options.length - 1;
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex: 0,
        destructiveButtonIndex: destructiveIndex,
        title: issue.identifier,
      },
      (i) => {
        // The sheet is gone by the time this runs (and it runs for "cancel"
        // too). Its presentation can detach the timeline's native list
        // without a route change, so do not wait for a symptom — put the
        // reader's offset back before any action below navigates.
        requestTimelineOffsetRestore();
        const action = actions[i];
        if (action === "pin") {
          createPin.mutate({ item_type: "issue", item_id: issue.id });
        } else if (action === "unpin") {
          deletePin.mutate({ itemType: "issue", itemId: issue.id });
        } else if (action === "edit") {
          if (wsSlug) router.push(`/${wsSlug}/issue/${issue.id}/edit`);
        } else if (action === "copy_link" && issueLink) {
          Clipboard.setStringAsync(issueLink);
        } else if (action === "open_web" && issueLink) {
          Linking.openURL(issueLink);
        } else if (action === "delete") {
          confirmDelete(issue, t, () =>
            deleteIssue.mutate(issue.id, {
              onSuccess: () => router.back(),
              onError: (error) => Alert.alert(
                t("delete.failed_title"),
                error instanceof ApiError && error.status === 403
                  ? t("delete.permission_denied")
                  : t("delete.failed"),
              ),
            }),
          );
        }
      },
    );
  }, [issue, wsSlug, deleteIssue, isPinned, createPin, deletePin, t]);

  const finishComplete = useCallback(() => {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
    if (from !== "inbox") return;
    useInboxToastStore.getState().show(t("complete.success_toast"));
    router.back();
  }, [from, t]);

  const showArchiveFailure = useCallback(
    function showFailure() {
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Error,
      ).catch(() => {});
      Alert.alert(
        t("complete.archive_failed_title"),
        t("complete.archive_failed_message"),
        [
          { text: t("common:actions.cancel"), style: "cancel" },
          {
            text: t("complete.retry_archive"),
            onPress: () =>
              retryArchiveIssue(undefined, {
                onSuccess: (result) => {
                  if (!result) return;
                  if (result.archiveError) {
                    showFailure();
                    return;
                  }
                  finishComplete();
                },
              }),
          },
        ],
      );
    },
    [finishComplete, retryArchiveIssue, t],
  );

  const confirmComplete = useCallback(() => {
    completeIssue(undefined, {
      onSuccess: (result) => {
        if (!result) return;
        if (result.archiveError) {
          showArchiveFailure();
          return;
        }
        finishComplete();
      },
      onError: (error) => {
        requestTimelineOffsetRestore();
        Alert.alert(
          t("complete.status_failed_title"),
          error instanceof Error && error.message
            ? error.message
            : t("complete.status_failed_message"),
        );
      },
    });
  }, [completeIssue, finishComplete, showArchiveFailure, t]);

  const onPressComplete = useCallback(() => {
    if (complete.isPending) return;
    beginTimelineOffsetGuard();
    // Presenting the confirm alert can detach the timeline's native list (the
    // same reason the "…" sheet restores explicitly). Doing it for both
    // dismissal paths keeps the header button free of a scroll side effect
    // without changing what the button does.
    Alert.alert(
      t("complete.confirm_title"),
      t("complete.confirm_body"),
      [
        {
          text: t("common:actions.cancel"),
          style: "cancel",
          onPress: requestTimelineOffsetRestore,
        },
        {
          text: t("complete.confirm_action"),
          onPress: () => {
            requestTimelineOffsetRestore();
            confirmComplete();
          },
        },
      ],
    );
  }, [complete.isPending, confirmComplete, t]);

  const showComplete = shouldShowInboxCompleteButton({
    fromInbox: from === "inbox",
    issue,
    canEdit,
    isCompleting: complete.isPending,
  });

  // Header options must have a stable identity. Passing a freshly created
  // `headerRight` closure inside an object literal makes react-navigation
  // re-apply the header on every render of this screen — including the
  // re-renders caused by agent-task queries ticking in the badge — and each
  // re-application re-runs the native header layout over the list. Memoising
  // keeps the header (and the list beneath it) untouched unless something it
  // actually displays changes.
  const headerRight = useCallback(
    () => (
      <View className="flex-row items-center gap-2">
        {/* Ambient agent-working badge — renders null when no active tasks,
         *  so it doesn't crowd the header in the common case. See
         *  agent-header-badge.tsx. */}
        <AgentHeaderBadge issueId={id} />
        {showComplete ? (
          complete.isPending ? (
            <View className="size-9 items-center justify-center">
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <IconButton
              name="checkmark"
              onPress={onPressComplete}
              accessibilityLabel={t("complete.action")}
            />
          )
        ) : null}
        <IconButton
          name="ellipsis-horizontal"
          onPress={onPressMore}
          accessibilityLabel={t("menu.issue_actions")}
        />
      </View>
    ),
    [
      id,
      onPressMore,
      t,
      showComplete,
      complete.isPending,
      onPressComplete,
    ],
  );
  const screenOptions = useMemo(
    () => ({
      title: issue?.identifier ?? t("navigation:routes.issue"),
      headerBackTitle: t("common:actions.back"),
      // iOS's notch / status-bar tap-to-top is off on this list (its hit band
      // also caught taps on the header row), so the identifier in the header
      // becomes the aimed-at way back to the top. The native title is
      // replaced, so match its 17 pt semibold weight.
      headerTitle: issue
        ? () => (
            <Pressable
              onPress={requestTimelineScrollToTop}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("a11y.scroll_to_top")}
            >
              <Text className="text-[17px] font-semibold text-foreground">
                {issue.identifier}
              </Text>
            </Pressable>
          )
        : undefined,
      headerRight: issue ? headerRight : undefined,
    }),
    [issue, t, headerRight],
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={screenOptions} />
      {/* Loading / error only replace the content while there is nothing to
       *  show. A background refetch that fails (foreground recovery, WS
       *  invalidate, pull-to-refresh) sets `detail.error` while `issue` is
       *  still cached — swapping the timeline out for the error screen then
       *  unmounts the list and loses the reader's scroll position. */}
      {detail.isLoading && !issue ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !issue ? (
        <View className="flex-1 items-center justify-center px-6 gap-3">
          <Text className="text-sm text-destructive text-center">
            {t("errors.load_failed", {
              message:
                detail.error instanceof Error
                  ? detail.error.message
                  : "not found",
            })}
          </Text>
          <Button variant="outline" onPress={() => detail.refetch()}>
            <Text>{t("common:actions.retry")}</Text>
          </Button>
        </View>
      ) : (
        <View className="flex-1">
          <TimelineList
            issue={issue}
            entries={timeline.data}
            timelineLoading={timeline.isLoading}
            refreshing={refreshingManually}
            onRefresh={onRefreshWithHaptics}
            highlightCommentId={highlight}
            highlightNonce={h}
            fromInbox={from === "inbox"}
          />
          <InlineCommentComposer issueId={id} />
        </View>
      )}
    </View>
  );
}

function confirmDelete(
  issue: Issue,
  t: (key: string, options?: Record<string, unknown>) => string,
  onConfirm: () => void,
) {
  Alert.alert(
    t("delete.title"),
    t("delete.message", { identifier: issue.identifier }),
    [
      { text: t("common:actions.cancel"), style: "cancel" },
      { text: t("common:actions.delete"), style: "destructive", onPress: onConfirm },
    ],
  );
}
