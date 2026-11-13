/**
 * Chronological issue timeline backed by FlashList.
 * Normal opens show the header; deep links start at the bottom and highlight a
 * target when its row is rendered. MVCP keeps the viewport stable as asynchronous
 * Markdown, images, and WebSocket patches change row heights.
 *
 * Avoid repeated scrollToEnd calls during content resizing: they can override
 * user scrolling. New replies use the explicit jump-to-new chip instead of
 * automatically following appends. Item separators provide spacing between rows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { Issue, TimelineEntry } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { IssueHeaderCard } from "./issue-header-card";
import { IssueDescription } from "./issue-description";
import { IssueReactionRow } from "./issue-reaction-row";
import { ActivityRow } from "./activity-row";
import { CommentCard } from "./comment-card";
import { useLastViewedStore } from "@/data/stores/last-viewed-store";
import { coalesceTimeline } from "@/lib/timeline-coalesce";
import { buildTimelineRows, type TimelineRow } from "@/lib/timeline-thread";
import { ImageSequenceProvider } from "@/lib/markdown/image-sequence";
import { issueAttachmentsOptions } from "@/data/queries/issues";
import { useWorkspaceStore } from "@/data/workspace-store";
import type { ImageSequenceBlock } from "@multica/core/attachments/image-sequence";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useT } from "@/lib/i18n";
import { useCommentSelectStore } from "@/data/comment-select-store";
import { subscribeTimelineOffsetRestore } from "@/lib/timeline-offset-restore";
import {
  isAtBottomFromMetrics,
  recordedUserOffset,
  shouldRecoverFromUnintendedTop,
  shouldRestoreOffsetAfterResize,
  shouldRestoreOffsetOnRefocus,
  viewportChanged,
} from "@/lib/scroll-offset-guard";

interface Props {
  issue: Issue;
  entries: TimelineEntry[] | undefined;
  timelineLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  /** Inbox deep-link target. Root comment id OR reply id — replies live
   *  inline inside their parent's CommentCard, so a reply target scrolls
   *  to the parent's row and the card highlights the matching child. */
  highlightCommentId?: string;
  /** Per-tap nonce. Re-tapping the same inbox row produces the same
   *  `highlightCommentId` but a fresh nonce, which re-triggers the
   *  scroll-and-flash effect (without this, identical props short-circuit). */
  highlightNonce?: string;
}

/** How long the flash stays "claimed" before we let a new highlight take
 *  over. The fade-out itself is driven by the Reanimated sequence inside
 *  CommentCard; this is just the upstream gate. 5s gives the user time
 *  to land at the bottom, realise the target is an older comment, and
 *  scroll up to it — the overlay still fires when the row mounts. */
const HIGHLIGHT_HOLD_MS = 5000;

/** Pixel slack at the bottom edge — inside this band we treat the user as
 *  "already at bottom" so the new-comment chip doesn't fire for entries
 *  the user is already about to see. */
const AT_BOTTOM_SLACK_PX = 80;

/** Sentinel id for the "New since last view" divider row injected into the
 *  FlatList data. Picked because it can never collide with a real comment
 *  / activity uuid. */
const DIVIDER_ID = "__divider__";

export function TimelineList({
  issue,
  entries,
  timelineLoading,
  refreshing,
  onRefresh,
  highlightCommentId,
  highlightNonce,
}: Props) {
  // Top-level selection subscription gates the outer "tap-outside-to-dismiss"
  // Pressable below. When null, the Pressable stays disabled and every tap
  // passes through to comment cards / chip rows / reactions normally.
  const selectingId = useCommentSelectStore((s) => s.selectingId);

  // Server already returns ASC oldest-first. Pipeline:
  //   1. coalesceTimeline → merge consecutive identical activities
  //   2. buildTimelineRows → reorder so replies sit adjacent to their parent
  //      and tag each reply with `replyTo` for the card to render the
  //      "↪ Replying to" header + thread-line border. This is the mobile
  //      flat-list interpretation of web's recursive reply tree.
  const data = useMemo<TimelineRow[]>(() => {
    if (!entries) return [];
    return buildTimelineRows(coalesceTimeline(entries));
  }, [entries]);

  // Every image on this screen, in render order: the description first, then
  // each comment row with its replies (MUL-5752). Tapping any of them opens
  // the lightbox at its real position so a swipe walks to the next.
  //
  // The description's attachments come from the same query IssueDescription
  // uses — TanStack Query dedupes it, so this adds no request.
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { data: issueAttachments } = useQuery(
    issueAttachmentsOptions(wsId, issue.id),
  );
  const imageBlocks = useMemo<ImageSequenceBlock[]>(() => {
    const blocks: ImageSequenceBlock[] = [
      { content: issue.description, attachments: issueAttachments },
    ];
    for (const row of data) {
      if (row.entry.type !== "comment") continue;
      blocks.push({
        content: row.entry.content,
        attachments: row.entry.attachments,
      });
      for (const reply of row.replies) {
        blocks.push({ content: reply.content, attachments: reply.attachments });
      }
    }
    return blocks;
  }, [issue.description, issueAttachments, data]);

  const listRef = useRef<FlashListRef<TimelineRow>>(null);
  // Last offset the reader's finger produced (drag + momentum). Programmatic
  // restores never write it, so it is safe to re-apply at any later point.
  const userOffsetRef = useRef(0);
  const userDraggingRef = useRef(false);
  const viewportHeightRef = useRef(0);
  const restoreRafRef = useRef<number | null>(null);
  // Set while we are applying an offset ourselves. Scroll events caused by
  // that restore must not overwrite the saved offset (it would ratify
  // whatever the platform did) and must not trip the unintended-top
  // detector. Held for two frames, which is how long FlashList needs to
  // deliver the resulting scroll event.
  const restoringRef = useRef(false);
  const restoringFramesRef = useRef<number | null>(null);
  const metricsRef = useRef({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0,
  });
  const previousOffsetRef = useRef(0);
  // Gates single-shot per (commentId, nonce) tuple. Re-tap from inbox
  // bumps the nonce → ref no longer matches → effect re-fires.
  const lastStampRef = useRef<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // True only while an inbox deep link is still landing. Bottom-anchored
  // rendering is a property of the FIRST paint; keeping it on for the whole
  // screen lifetime made every later viewport change re-anchor the list and
  // permanently disabled the resize guard below.
  const [landingPending, setLandingPending] = useState(!!highlightCommentId);

  useEffect(() => {
    return () => {
      if (restoreRafRef.current != null) {
        cancelAnimationFrame(restoreRafRef.current);
      }
      if (restoringFramesRef.current != null) {
        cancelAnimationFrame(restoringFramesRef.current);
      }
    };
  }, []);

  // ── "New since last view" divider ─────────────────────────────────────
  // Snapshot the last-viewed timestamp ONCE on mount. Subsequent WS
  // appends shouldn't shift the divider — the user wants a stable
  // "where I was when I came back" boundary. The store update happens on
  // unmount, gated on the user having actually scrolled past the divider.
  const [lastViewedSnapshot] = useState(
    () => useLastViewedStore.getState().getLastViewed(issue.id) ?? null,
  );
  const dividerAnchorId = useMemo(() => {
    const snapshot = lastViewedSnapshot;
    if (!snapshot) return null;
    // First entry strictly newer than the snapshot anchors the divider;
    // divider draws ABOVE this row. If everything is older, no divider.
    const found = data.find((r) => r.entry.created_at > snapshot);
    return found ? found.entry.id : null;
  }, [data, lastViewedSnapshot]);
  const dividerScrolledPastRef = useRef(false);

  useEffect(() => {
    if (!highlightCommentId || data.length === 0) return;
    const stamp = `${highlightCommentId}:${highlightNonce ?? ""}`;
    if (lastStampRef.current === stamp) return;
    lastStampRef.current = stamp;

    setHighlightedId(highlightCommentId);

    const fade = setTimeout(() => setHighlightedId(null), HIGHLIGHT_HOLD_MS);
    return () => clearTimeout(fade);
  }, [highlightCommentId, highlightNonce, data.length]);

  // ── New-comment-while-reading chip ────────────────────────────────────
  // After landing, if WS appends new entries while the user is NOT at the
  // bottom, surface a floating "↓ N new" chip instead of silently shifting
  // content below the viewport. Tapping the chip scrolls to bottom and
  // clears the counter; reaching the bottom by hand also clears it.
  const [newCount, setNewCount] = useState(0);
  // Measured on every scroll / content-size pass; never assumed. `false`
  // until the list has a viewport means "unknown", which the restores below
  // treat conservatively (they only act on a saved offset).
  const isAtBottomRef = useRef(false);
  const lastDataLenRef = useRef(0);
  useEffect(() => {
    const wasEmpty = lastDataLenRef.current === 0;
    const grew = data.length > lastDataLenRef.current;
    const diff = data.length - lastDataLenRef.current;
    lastDataLenRef.current = data.length;
    if (!grew) return;
    // The first 0→N load is not "new messages arriving while you read";
    // keep the chip silent until a later append lands with the reader
    // scrolled up.
    if (wasEmpty) return;
    if (isAtBottomRef.current) return;
    setNewCount((prev) => prev + diff);
  }, [data.length]);

  /** Mark the next two frames as our own scroll, not the reader's. */
  const markRestoring = useCallback(() => {
    restoringRef.current = true;
    if (restoringFramesRef.current != null) {
      cancelAnimationFrame(restoringFramesRef.current);
    }
    restoringFramesRef.current = requestAnimationFrame(() => {
      restoringFramesRef.current = requestAnimationFrame(() => {
        restoringFramesRef.current = null;
        restoringRef.current = false;
      });
    });
  }, []);

  /** Re-apply the offset the reader last chose, if there is one. */
  const applySavedOffset = useCallback(() => {
    const target = userOffsetRef.current;
    if (target <= 1) return;
    markRestoring();
    listRef.current?.scrollToOffset({ offset: target, animated: false });
  }, [markRestoring]);

  const logOffset = useCallback(
    (phase: string, extra: Record<string, unknown> = {}) => {
      if (!__DEV__) return;
      console.log("[timeline-offset]", {
        phase,
        offsetY: Math.round(metricsRef.current.offsetY),
        saved: Math.round(userOffsetRef.current),
        dragging: userDraggingRef.current,
        restoring: restoringRef.current,
        atBottom: isAtBottomRef.current,
        ...extra,
      });
    },
    [],
  );

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      const previousOffsetY = previousOffsetRef.current;
      metricsRef.current = {
        contentHeight: contentSize.height,
        offsetY: contentOffset.y,
        viewportHeight: layoutMeasurement.height,
      };
      previousOffsetRef.current = contentOffset.y;

      const wasAtBottom = isAtBottomRef.current;
      isAtBottomRef.current = isAtBottomFromMetrics(
        metricsRef.current,
        AT_BOTTOM_SLACK_PX,
      );
      // Reaching the bottom clears the unread-new chip — same iMessage /
      // chat-app semantic: "I've caught up".
      if (!wasAtBottom && isAtBottomRef.current && newCount > 0) {
        setNewCount(0);
      }

      // Backstop for a re-anchor we have no event for (ActionSheet, native
      // detach): a sudden jump to the top that no finger produced. Restore
      // before recording, so the bad offset never becomes the saved value.
      if (
        shouldRecoverFromUnintendedTop({
          savedOffset: userOffsetRef.current,
          previousOffsetY,
          offsetY: contentOffset.y,
          userInteracting: userDraggingRef.current,
          restoring: restoringRef.current,
        })
      ) {
        logOffset("recover-unintended-top", { previousOffsetY });
        applySavedOffset();
        return;
      }

      userOffsetRef.current = recordedUserOffset(
        userOffsetRef.current,
        contentOffset.y,
        { restoring: restoringRef.current },
      );
    },
    [applySavedOffset, logOffset, newCount],
  );

  /** Content-height changes move the bottom edge; re-measure without a scroll. */
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      metricsRef.current = {
        ...metricsRef.current,
        contentHeight: height,
      };
      isAtBottomRef.current = isAtBottomFromMetrics(
        metricsRef.current,
        AT_BOTTOM_SLACK_PX,
      );
    },
    [],
  );

  // ── Scroll-offset ownership across viewport changes ───────────────────
  //
  // Buttons in this screen's navigation header (the running-agent badge and
  // the "…" menu) do not scroll anything, but tapping them takes focus away
  // from the inline composer, which collapses and hands the list a taller
  // viewport in the same frame. FlashList's MVCP re-anchors content on that
  // resize and can snap a mid-timeline reader back to the top. Re-applying
  // the recorded offset after the resize keeps header interactions
  // side-effect free. Same guard covers the sheet dismissals and the offline
  // strip appearing above the navigator.
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextHeight = event.nativeEvent.layout.height;
      const resized = viewportChanged(viewportHeightRef.current, nextHeight);
      viewportHeightRef.current = nextHeight;
      metricsRef.current = {
        ...metricsRef.current,
        viewportHeight: nextHeight,
      };
      if (!resized) return;
      // A reader who was at the bottom should stay at the bottom when the
      // viewport changes (keyboard away, sheet dismissed): re-pinning to the
      // end is more faithful than replaying an old pixel offset that no
      // longer reaches the newest row.
      const wasAtBottom = isAtBottomRef.current;
      if (
        !wasAtBottom &&
        !shouldRestoreOffsetAfterResize({
          savedOffset: userOffsetRef.current,
          userInteracting: userDraggingRef.current,
          hasDeepLinkTarget: landingPending,
        })
      ) {
        logOffset("layout-resize-skip");
        return;
      }
      logOffset("layout-resize-restore", { wasAtBottom, nextHeight });
      const target = userOffsetRef.current;
      // Let the resize settle (and any re-anchor it triggered) before
      // re-applying; two frames covers the native layout + MVCP pass.
      if (restoreRafRef.current != null) cancelAnimationFrame(restoreRafRef.current);
      restoreRafRef.current = requestAnimationFrame(() => {
        restoreRafRef.current = requestAnimationFrame(() => {
          restoreRafRef.current = null;
          if (userDraggingRef.current) return;
          if (wasAtBottom) {
            markRestoring();
            listRef.current?.scrollToEnd({ animated: false });
          } else {
            markRestoring();
            listRef.current?.scrollToOffset({
              offset: target,
              animated: false,
            });
          }
        });
      });
    },
    [landingPending, logOffset, markRestoring],
  );

  // ── Offset survives a presented sheet ─────────────────────────────────
  //
  // The runs sheet and the issue action sheet are separate routes: pushing
  // one blurs this screen, and on dismissal the native list can come back at
  // offset 0 even though React state — and the offset the reader chose —
  // never changed. Re-apply it once focus returns. Two frames, because the
  // reattached scroll view settles its content before it accepts an offset.
  const isFocused = useIsFocused();
  const wasFocusedRef = useRef(isFocused);
  useEffect(() => {
    const wasFocused = wasFocusedRef.current;
    wasFocusedRef.current = isFocused;
    if (!isFocused || wasFocused) return;
    if (
      !shouldRestoreOffsetOnRefocus({
        savedOffset: userOffsetRef.current,
        atBottom: isAtBottomRef.current,
      })
    ) {
      return;
    }
    logOffset("refocus-restore");
    const target = userOffsetRef.current;
    let second: number | null = null;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        markRestoring();
        listRef.current?.scrollToOffset({ offset: target, animated: false });
      });
    });
    return () => {
      cancelAnimationFrame(first);
      if (second != null) cancelAnimationFrame(second);
    };
  }, [isFocused, logOffset, markRestoring]);

  // ── Offset survives an ActionSheet ────────────────────────────────────
  //
  // `ActionSheetIOS` is not a route: `useIsFocused` never changes, yet the
  // presented controller can detach the native list and bring it back at the
  // top. AppState reports the transient `inactive` for those platform
  // presentations, so use the return to `active` as the trigger.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (next !== "active" || previous === "active") return;
      if (
        !shouldRestoreOffsetOnRefocus({
          savedOffset: userOffsetRef.current,
          atBottom: isAtBottomRef.current,
        })
      ) {
        return;
      }
      logOffset("appstate-restore", { previous });
      const target = userOffsetRef.current;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          markRestoring();
          listRef.current?.scrollToOffset({ offset: target, animated: false });
        });
      });
    });
    return () => sub.remove();
  }, [logOffset, markRestoring]);

  // ── Offset survives the header action sheet ───────────────────────────
  //
  // `ActionSheetIOS` is neither a route nor a reliable AppState transition,
  // so the screen calls us directly when its sheet closes (including
  // "cancel"). Two frames cover the dismissal's detach/re-attach; the short
  // follow-up catches a re-anchor that lands just after it, which is the
  // "the list jumps back to the top" report this exists for.
  useEffect(
    () =>
      subscribeTimelineOffsetRestore(() => {
        if (
          !shouldRestoreOffsetOnRefocus({
            savedOffset: userOffsetRef.current,
            atBottom: isAtBottomRef.current,
          })
        ) {
          return;
        }
        logOffset("action-sheet-restore");
        const target = userOffsetRef.current;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            markRestoring();
            listRef.current?.scrollToOffset({ offset: target, animated: false });
          });
        });
        setTimeout(() => {
          if (userDraggingRef.current) return;
          markRestoring();
          listRef.current?.scrollToOffset({ offset: target, animated: false });
        }, 320);
      }),
    [logOffset, markRestoring],
  );

  const onJumpToNew = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
    setNewCount(0);
  }, []);

  // ── Inject divider as a sentinel row before its anchor entry ──────────
  // FlatList wants a flat data[] and a stable key per row. Rather than
  // teach the renderer about "items + dividers" via a union type, fake a
  // TimelineRow with a sentinel id; renderItem checks the id first.
  const dataWithDivider = useMemo<TimelineRow[]>(() => {
    if (!dividerAnchorId) return data;
    const anchorIdx = data.findIndex((r) => r.entry.id === dividerAnchorId);
    if (anchorIdx <= 0) return data;
    const divider: TimelineRow = {
      // Cast: this entry is a synthetic marker, not a real TimelineEntry —
      // renderItem keys off `id === DIVIDER_ID` and never reads other fields.
      entry: {
        id: DIVIDER_ID,
        type: "activity",
        created_at: "",
        actor_type: "",
        actor_id: "",
      } as unknown as TimelineEntry,
      replies: [],
    };
    return [...data.slice(0, anchorIdx), divider, ...data.slice(anchorIdx)];
  }, [data, dividerAnchorId]);

  // Mark "scrolled past" once the divider row leaves the viewport — used
  // by the unmount effect below to decide whether to bump last-viewed.
  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 1 }),
    [],
  );
  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (!dividerAnchorId) return;
      if (dividerScrolledPastRef.current) return;
      const dividerIdx = dataWithDivider.findIndex(
        (r) => r.entry.id === DIVIDER_ID,
      );
      if (dividerIdx < 0) return;
      const minVisibleIdx = viewableItems.reduce(
        (acc, v) => (v.index != null && v.index < acc ? v.index : acc),
        Number.POSITIVE_INFINITY,
      );
      if (minVisibleIdx > dividerIdx) {
        dividerScrolledPastRef.current = true;
      }
    },
    [dividerAnchorId, dataWithDivider],
  );
  // FlashList v2 captures `viewabilityConfigCallbackPairs` at mount —
  // "Changing viewabilityConfig on the fly is not supported." So we wrap
  // the handler in a stable ref-backed forwarder and pass a frozen pairs
  // array. The inner closure still updates with deps (dividerAnchorId,
  // dataWithDivider), but the prop identity FlashList sees is stable.
  const handlerRef = useRef(handleViewableItemsChanged);
  useEffect(() => {
    handlerRef.current = handleViewableItemsChanged;
  }, [handleViewableItemsChanged]);
  const stableViewabilityHandler = useCallback(
    (info: { viewableItems: ViewToken[] }) => handlerRef.current(info),
    [],
  );
  const [viewabilityCallbackPairs] = useState(() => [
    {
      viewabilityConfig,
      onViewableItemsChanged: stableViewabilityHandler,
    },
  ]);

  // On unmount, mark the issue's timeline as "viewed up to now" if the
  // user has either (a) scrolled past the divider or (b) had no divider
  // because everything was already older than their previous visit.
  // Otherwise leave the snapshot alone so a next visit preserves the
  // "where I was" line.
  const markViewed = useLastViewedStore((s) => s.markViewed);
  useEffect(() => {
    const issueId = issue.id;
    return () => {
      if (!dividerAnchorId || dividerScrolledPastRef.current) {
        markViewed(issueId);
      }
    };
    // We intentionally bind the cleanup to the issueId-snapshot only —
    // re-running on `dividerAnchorId` changes would lose the original
    // anchor's "scrolled past" state if WS extended the timeline mid-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.id]);

  const ListHeader = (
    <View>
      <IssueHeaderCard issue={issue} />
      <IssueDescription issueId={issue.id} description={issue.description} />
      <IssueReactionRow issue={issue} />
      <View className="px-4 pt-4 pb-2 border-t border-border">
        <Text className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Activity
        </Text>
      </View>
      {timelineLoading && (!entries || entries.length === 0) ? (
        <View className="py-6 items-center">
          <ActivityIndicator />
        </View>
      ) : null}
    </View>
  );

  // Fresh inbox deep-link: land on the newest row once the timeline has data.
  //
  // This used to be implemented by remounting the FlashList (`key` changing
  // to `hl-<nonce>` so its one-shot initial scroll re-ran). A remount throws
  // away the whole native scroll view: whenever the timeline cache
  // momentarily emptied and refilled, the key flipped and the reader was
  // dropped at the top. One stable list plus one explicit scroll per
  // (comment, nonce) pair keeps the deep-link behaviour without ever
  // detaching the list.
  const landedStampRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightCommentId || dataWithDivider.length === 0) return;
    const stamp = `${highlightCommentId}:${highlightNonce ?? ""}`;
    if (landedStampRef.current === stamp) return;
    landedStampRef.current = stamp;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
      // From here on the list behaves like any other open issue: later
      // viewport changes must preserve the reader's offset, not re-anchor
      // to the inbox target's bottom.
      setLandingPending(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [highlightCommentId, highlightNonce, dataWithDivider.length]);

  return (
    <ImageSequenceProvider blocks={imageBlocks}>
    <View className="flex-1">
      {/* Outer Pressable owns the "tap anywhere outside the selected
          comment to exit text-selection mode" gesture. Disabled when
          no comment is selected → layout-only wrapper, every tap passes
          through to cells / chips / reactions. Active state captures any
          tap that didn't fire an inner Pressable — selecting CommentBody
          renders without its own Pressable wrapper (see comment-card.tsx
          `if (isSelecting) return body;`), so taps on the selected
          comment dismiss too, matching iOS Notes / iMessage. Scroll
          gestures are unaffected. */}
      <Pressable
        onLayout={handleLayout}
        onPress={
          selectingId
            ? () => useCommentSelectStore.getState().clear()
            : undefined
        }
        disabled={!selectingId}
        style={{ flex: 1 }}
      >
      <FlashList
        ref={listRef}
        data={dataWithDivider}
        keyExtractor={(row) => row.entry.id}
        ListHeaderComponent={ListHeader}
        // Drag-to-dismiss keyboard — when the user scrolls the timeline
        // while the composer keyboard is up, the keyboard slides down
        // interactively (iMessage / WhatsApp / Slack idiom). Pairs with the
        // composer's `onBlur` → auto-collapse to pill: scroll dismisses
        // keyboard → TextInput blurs → composer collapses if empty.
        keyboardDismissMode="on-drag"
        // Tap-on-row inside the list (long-press a comment, tap a
        // reaction) should still register even when the keyboard is up.
        keyboardShouldPersistTaps="handled"
        // FlashList v2 MVCP. `startRenderingFromBottom` only applies when a
        // deep-link is active — a normal issue-open lands at the top so the
        // user sees the header (title, description, status) first. After
        // initial paint the (always-on) MVCP keeps visible content stable
        // when upper rows resize via async markdown / WS events; we do NOT
        // set `autoscrollToBottomThreshold` because timeline uses an
        // explicit "↓ N new" chip instead of silently following appends.
        maintainVisibleContentPosition={{
          startRenderingFromBottom: landingPending,
        }}
        // "Activity" is a section heading, not a sibling row — it should
        // hug the first entry the way iOS Settings / Linear sections do.
        // 4 px is just enough breathing room without making the heading
        // float above the list. (12 px = row-to-row gap, wrong here.)
        ListHeaderComponentStyle={{ marginBottom: 4 }}
        ItemSeparatorComponent={RowSeparator}
        renderItem={({ item }) => {
          if (item.entry.id === DIVIDER_ID) {
            return <UnreadDivider />;
          }
          return item.entry.type === "comment" ? (
            <CommentCard
              entry={item.entry}
              replies={item.replies}
              issueId={issue.id}
              issueIdentifier={issue.identifier}
              highlightedCommentId={highlightedId}
            />
          ) : (
            <ActivityRow entry={item.entry} />
          );
        }}
        onScroll={handleScroll}
        onContentSizeChange={handleContentSizeChange}
        // Any user-initiated scroll exits comment text-selection mode —
        // matches iMessage's behavior where scrolling implicitly commits /
        // dismisses the selection caret. Hooks both drag-start and the
        // momentum kick after a flick so a fast scroll can't escape.
        //
        // `userDraggingRef` brackets the whole gesture (drag + momentum) so
        // the offset guard knows a 0-offset report is the reader's own doing.
        onScrollBeginDrag={() => {
          userDraggingRef.current = true;
          useCommentSelectStore.getState().clear();
        }}
        onMomentumScrollBegin={() => {
          userDraggingRef.current = true;
          useCommentSelectStore.getState().clear();
        }}
        onScrollEndDrag={() => {
          userDraggingRef.current = false;
        }}
        onMomentumScrollEnd={() => {
          userDraggingRef.current = false;
        }}
        viewabilityConfigCallbackPairs={viewabilityCallbackPairs}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 16 }}
      />
      </Pressable>
      {newCount > 0 ? (
        <NewCommentChip count={newCount} onPress={onJumpToNew} />
      ) : null}
    </View>
    </ImageSequenceProvider>
  );
}

/**
 * 12 px vertical gap between every timeline row. FlashList ignores
 * `gap-*` on `contentContainer`, so the spacing is supplied via this
 * separator component — same pattern as chat-message-list.tsx.
 */
function RowSeparator() {
  return <View style={{ height: 12 }} />;
}

/**
 * Horizontal rule + "New" pill spanning the row width. Drawn between the
 * last entry the user had seen on their previous visit and the first one
 * they haven't. Mirrors Slack / iMessage / Things' "unread divider"
 * idiom — a passive visual mark, not interactive (no tap-to-dismiss; it
 * disappears the next time the user scrolls past and unmounts the screen).
 */
function UnreadDivider() {
  const { t } = useT("issues");
  return (
    <View className="flex-row items-center gap-2 px-4">
      <View className="flex-1 h-px bg-destructive/40" />
      <Text className="text-[10px] uppercase tracking-wider font-medium text-destructive">
        {t("new_badge")}
      </Text>
      <View className="flex-1 h-px bg-destructive/40" />
    </View>
  );
}

/**
 * Floating "↓ N new" chip pinned above the composer area. Surfaces WS
 * arrivals the user can't currently see because they're scrolled up.
 * Tap → smooth scrollToEnd + reset counter. Reaching the bottom by hand
 * also clears it (see handleScroll above).
 *
 * Positioned absolute bottom-center inside the parent <View flex-1> wrap;
 * doesn't overlap content because the timeline's `contentContainer`
 * already has its own bottom padding for breathing room above the
 * composer hand-off.
 */
function NewCommentChip({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const { colorScheme } = useColorScheme();
  const { t } = useT("issues");
  const fg = THEME[colorScheme].primaryForeground;
  return (
    <Pressable
      onPress={onPress}
      className="absolute bottom-3 self-center px-3.5 py-1.5 rounded-full bg-primary active:opacity-80 flex-row items-center gap-1.5"
      accessibilityRole="button"
      accessibilityLabel={t(
        count === 1 ? "jump_a11y_one" : "jump_a11y_other",
        { count },
      )}
      style={{
        // shadow comes from system, not Tailwind — keeps the chip readable
        // against either light or dark timeline content beneath.
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
        elevation: 4,
      }}
    >
      <Ionicons name="arrow-down" size={14} color={fg} />
      <Text className="text-xs font-semibold text-primary-foreground">
        {count} new
      </Text>
    </Pressable>
  );
}
