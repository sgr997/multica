/**
 * Chronological FlashList chat with initial bottom positioning and MVCP.
 * Follow new messages only while the user is near the bottom; preserve reading
 * position through asynchronous Markdown and image resizing.
 *
 * Render all normalized message roles and failure styling. Attachments not used
 * inline appear as standalone cards. Long-press actions highlight the target
 * without adding a border that would shift the layout.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import type {
  Agent,
  ChatMessage,
  ChatPendingTask,
  ChatQuickAction,
  TaskMessagePayload,
} from "@multica/core/types";
import type { AgentAvailability } from "@multica/core/agents";
import { continuousCorners } from "@/lib/radius";
import { taskMessagesOptions } from "@/data/queries/chat";
import { Text } from "@/components/ui/text";
import { Markdown } from "@/lib/markdown";
import { ImageSequenceProvider } from "@/lib/markdown/image-sequence";
import { failureReasonKey } from "@/lib/failure-reason-label";
import { formatElapsedMs } from "@/lib/format-elapsed";
import { cn } from "@/lib/utils";
import {
  followAfterUserScroll,
  isAtBottom,
  shouldAutoScrollToLatest,
  type ChatScrollMetrics,
} from "@/lib/chat-scroll-follow";
import { useReduceMotion } from "@/lib/use-reduce-motion";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useChatSelectStore } from "@/data/chat-select-store";
import { useChatMessageLongPress } from "./message-long-press";
import { ChatEmptyState } from "./chat-empty-state";
import { ChatTimeline } from "./chat-timeline";
// Reuse the comment thread's standalone attachment list — same design web
// reuses in chat (AttachmentList). Renders any bound attachment not already
// referenced inline in the message content, with same-file dedup.
import { CommentAttachmentList } from "@/components/issue/comment-attachment-list";
import { StatusPill } from "./status-pill";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useT } from "@/lib/i18n";

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  /** Has the workspace ever started a chat? Drives empty-state copy. */
  hasSessions: boolean;
  /** Currently picked / inherited agent. */
  agent: Agent | null;
  /** Receive a conversation-starter tap. Caller writes into the draft store
   *  (or focuses the composer with the text) — empty state stays neutral
   *  about send vs. preview. */
  onPickPrompt: (text: string) => void;
  /** Send a persisted assistant follow-up without first copying it into draft. */
  onQuickAction?: (action: ChatQuickAction) => void | Promise<unknown>;
  quickActionsDisabled?: boolean;
  /** Server-authoritative pending-task snapshot for the active session.
   *  Used to render the live timeline + status line as the last item in
   *  the message stream, mirroring web's
   *  `packages/views/chat/components/chat-message-list.tsx` placement. */
  pendingTask?: ChatPendingTask | null;
  /** Live timeline rows for the in-flight task. Already fetched by the
   *  parent so this list doesn't have to manage its own subscription. */
  liveTaskMessages?: TaskMessagePayload[];
  /** Resolved availability — drives the StatusPill's "Offline" /
   *  "Reconnecting" stages. Pass `undefined` while loading. */
  availability?: AgentAvailability;
}

export function ChatMessageList({
  messages,
  loading,
  hasSessions,
  agent,
  onPickPrompt,
  onQuickAction,
  quickActionsDisabled = false,
  pendingTask,
  liveTaskMessages,
  availability,
}: Props) {
  // Top-level selection subscription gates the outer "tap-outside-to-dismiss"
  // Pressable below. When null, the Pressable stays disabled and every tap
  // passes through to the list cells / bubble long-press wrappers normally.
  const selectingId = useChatSelectStore((s) => s.selectingId);

  // ── Follow-the-latest state ────────────────────────────────────────────
  //
  // `following` is the reader's intent, not a measurement: it starts true
  // (sessions open at the bottom) and only a completed user gesture may flip
  // it. Content growing below the viewport — a streaming reply, a Late
  // image — also increases the distance from the bottom, so deriving intent
  // from geometry alone would stop following the moment the agent answers.
  const listRef = useRef<FlashListRef<ChatMessage>>(null);
  const followingRef = useRef(true);
  const userInteractingRef = useRef(false);
  const metricsRef = useRef<ChatScrollMetrics>({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0,
  });
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  // Rows that arrived while the reader was parked in history. The socket-down
  // fallback from the chat-refresh work can surface messages with no realtime
  // event, so arrivals are counted from the length delta rather than from a
  // socket callback. Session switches remount this component, resetting it.
  const [newCount, setNewCount] = useState(0);
  const messageCountRef = useRef(messages.length);

  const lastMessage = messages[messages.length - 1];
  const lastMessageIsUser = lastMessage?.role === "user";
  const lastMessageId = lastMessage?.id ?? null;
  // True for exactly the content-size pass that follows a message the reader
  // just sent. Sending is an explicit "take me to the newest" request even
  // from the middle of history — but it must not become a standing licence
  // to auto-scroll while the agent streams back, so the flag is consumed.
  const sentMessageJumpRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  useEffect(() => {
    const previousId = lastMessageIdRef.current;
    lastMessageIdRef.current = lastMessageId;
    if (previousId !== null && previousId !== lastMessageId && lastMessageIsUser) {
      sentMessageJumpRef.current = true;
    }
  }, [lastMessageId, lastMessageIsUser]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      metricsRef.current = {
        contentHeight: contentSize.height,
        offsetY: contentOffset.y,
        viewportHeight: layoutMeasurement.height,
      };
      // Programmatic scrolls and content growth still report offsets; they
      // must not be mistaken for the reader moving away from the bottom.
      if (!userInteractingRef.current) return;
      const atBottom = isAtBottom(metricsRef.current);
      followingRef.current = atBottom;
      setShowJumpToLatest(!atBottom);
      if (atBottom) setNewCount(0);
    },
    [],
  );

  const settleFollowState = useCallback(() => {
    userInteractingRef.current = false;
    const atBottom = followAfterUserScroll(metricsRef.current);
    followingRef.current = atBottom;
    setShowJumpToLatest(!atBottom);
    if (atBottom) setNewCount(0);
  }, []);

  useEffect(() => {
    const previous = messageCountRef.current;
    messageCountRef.current = messages.length;
    if (messages.length <= previous) return;
    if (followingRef.current) return;
    setNewCount((count) => count + (messages.length - previous));
  }, [messages.length]);

  const startUserInteraction = useCallback(() => {
    userInteractingRef.current = true;
    // Any user-initiated scroll exits message text-selection mode —
    // matches iMessage's behavior where scrolling implicitly commits /
    // dismisses the selection caret.
    useChatSelectStore.getState().clear();
  }, []);

  /**
   * Content-size changes are the single funnel for "something new is on
   * screen": a new message, the live task trace growing token by token, an
   * image finishing its decode, or the status line disappearing when the
   * reply lands. Scroll only when the reader is pinned to the bottom.
   */
  const handleContentSizeChange = useCallback(() => {
    if (
      !shouldAutoScrollToLatest({
        following: followingRef.current,
        userInteracting: userInteractingRef.current,
        lastMessageIsUser: sentMessageJumpRef.current,
      })
    ) {
      return;
    }
    sentMessageJumpRef.current = false;
    listRef.current?.scrollToEnd({ animated: false });
  }, []);

  const reduceMotion = useReduceMotion();
  const jumpToLatest = useCallback(() => {
    followingRef.current = true;
    setShowJumpToLatest(false);
    setNewCount(0);
    listRef.current?.scrollToEnd({ animated: !reduceMotion });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
      () => {},
    );
  }, [reduceMotion]);

  // Every image in this session, in message order (MUL-5752), so tapping one
  // opens the lightbox at its position and a swipe walks the rest.
  //
  // Above the loading / empty early returns because hooks must run on every
  // render — an empty `messages` just yields an empty block list.
  //
  // Persisted messages only — same boundary web draws: a task transcript's
  // images live behind a separate cache and inside a folded section, so they
  // keep opening on their own rather than joining a sequence the reader
  // cannot see the rest of.
  const imageBlocks = useMemo(
    () =>
      messages.map((message) => ({
        content: message.content,
        attachments: message.attachments,
      })),
    [messages],
  );

  if (loading && messages.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (messages.length === 0) {
    // Empty new-chat state. Lives here (rather than the parent screen) so
    // the empty state and the rendered list share spacing/layout rules.
    return (
      <ChatEmptyState
        hasSessions={hasSessions}
        agent={agent}
        onPickPrompt={onPickPrompt}
      />
    );
  }

  // Show the live trace + status line until the persisted assistant
  // message lands. Once chat:done writes the assistant row, AssistantRow's
  // own timeline (read from the same cache entry) owns the render — no
  // double-rendering.
  const pendingTaskId = pendingTask?.task_id ?? null;
  const pendingAlreadyPersisted =
    !!pendingTaskId &&
    messages.some(
      (m) => m.role === "assistant" && m.task_id === pendingTaskId,
    );
  const showLiveSection = !!pendingTaskId && !pendingAlreadyPersisted;
  const showLiveTimeline =
    showLiveSection && (liveTaskMessages?.length ?? 0) > 0;

  return (
    // Outer Pressable owns the "tap anywhere outside the selected bubble
    // to exit text-selection mode" gesture. Disabled when no message is
    // selected, so it's a layout-only wrapper and every tap passes straight
    // through to the FlashList cells. Active state captures any tap that
    // didn't fire an inner Pressable — bubble cells in selecting mode
    // render their body without a Pressable wrapper (see `MessageRow`'s
    // `if (isSelecting) return body;`), so taps on the selected bubble
    // also dismiss, matching iOS Notes / iMessage behaviour. Scroll
    // gestures are unaffected (Pressable only intercepts non-drag taps).
    <ImageSequenceProvider blocks={imageBlocks}>
    <View style={{ flex: 1 }}>
    <Pressable
      onPress={
        selectingId
          ? () => useChatSelectStore.getState().clear()
          : undefined
      }
      disabled={!selectingId}
      style={{ flex: 1 }}
    >
    {/* No `key` here on purpose: the chat screen remounts this whole
        component when the session changes, so the list, its follow intent
        and the jump-to-latest chip all start clean. Keying the list by the
        first message id would additionally remount it whenever an older
        message is prepended, dropping the reader at offset 0. */}
    <FlashList
      ref={listRef}
      data={messages}
      keyExtractor={(m) => m.id}
      renderItem={({ item }) => (
        <MessageRow
          message={item}
          onQuickAction={onQuickAction}
          quickActionsDisabled={quickActionsDisabled}
        />
      )}
      ItemSeparatorComponent={MessageSeparator}
      ListFooterComponent={
        showLiveSection ? (
          <View style={{ paddingTop: 12 }} className="gap-2">
            {showLiveTimeline ? (
              <ChatTimeline items={liveTaskMessages ?? []} isStreaming />
            ) : null}
            <StatusPill
              pendingTask={pendingTask}
              taskMessages={liveTaskMessages}
              availability={availability}
            />
          </View>
        ) : null
      }
      // Outer padding mirrors web's max-w-4xl px-5 py-4 container at
      // mobile scale. Vertical gap between bubbles handled by
      // ItemSeparatorComponent (FlashList doesn't honour `gap-*` on
      // contentContainer the way FlatList's gap-via-NativeWind did).
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 16,
      }}
      // Initial render starts at the bottom (newest message), and MVCP keeps
      // a reader's position stable when rows above them resize. Autoscroll
      // is NOT delegated to MVCP: it keys off distance-from-bottom, so the
      // footer growing during streaming would stop it. Follow-the-latest is
      // owned by `handleContentSizeChange` + the gesture state above.
      maintainVisibleContentPosition={{
        startRenderingFromBottom: true,
      }}
      // Any user-initiated scroll exits message text-selection mode —
      // matches iMessage's behavior where scrolling implicitly commits /
      // dismisses the selection caret. Hooks both drag-start and the
      // momentum kick after a flick so a fast scroll can't escape.
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onScrollBeginDrag={startUserInteraction}
      onMomentumScrollBegin={startUserInteraction}
      onScrollEndDrag={settleFollowState}
      onMomentumScrollEnd={settleFollowState}
      onContentSizeChange={handleContentSizeChange}
      // iMessage-style keyboard dismissal: dragging the list pulls the
      // keyboard down with the finger (iOS); tapping empty space between
      // bubbles dismisses it. `handled` keeps Pressables inside bubbles
      // (long-press action sheet etc.) firing normally.
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    />
    </Pressable>
    {showJumpToLatest || newCount > 0 ? (
      <JumpToLatestButton onPress={jumpToLatest} newCount={newCount} />
    ) : null}
    </View>
    </ImageSequenceProvider>
  );
}

function MessageSeparator() {
  return <View style={{ height: 12 }} />;
}

/**
 * Floating "back to latest" affordance, shown only while the reader is
 * scrolled up into history. Modeled on the issue timeline's "N new" chip —
 * same shape, same position, so the two chat-like surfaces behave alike.
 */
function JumpToLatestButton({
  onPress,
  newCount,
}: {
  onPress: () => void;
  newCount: number;
}) {
  const { t } = useT("chat");
  const { colorScheme } = useColorScheme();
  const fg = THEME[colorScheme].primaryForeground;
  const label =
    newCount > 0 ? t("list.new_messages", { count: newCount }) : t("scroll.jump_to_latest");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="absolute bottom-3 self-center px-3.5 py-1.5 rounded-full bg-primary active:opacity-80 flex-row items-center gap-1.5"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
        elevation: 4,
      }}
    >
      <Ionicons name="arrow-down" size={14} color={fg} />
      <Text className="text-xs font-semibold text-primary-foreground">
        {label}
      </Text>
    </Pressable>
  );
}

function MessageRow({
  message,
  onQuickAction,
  quickActionsDisabled,
}: {
  message: ChatMessage;
  onQuickAction?: (action: ChatQuickAction) => void | Promise<unknown>;
  quickActionsDisabled: boolean;
}) {
  const isUser = message.role === "user";
  const { t } = useT("chat");
  const isFailure = !!message.failure_reason;
  const isSelecting = useChatSelectStore(
    (s) => s.selectingId === message.id,
  );
  const longPress = useChatMessageLongPress(message);

  if (isFailure) {
    return (
      <FailureBubble
        reasonLabel={t(failureReasonKey(message.failure_reason))}
        rawError={message.content}
        elapsedMs={message.elapsed_ms ?? null}
        isSelecting={isSelecting}
        longPress={longPress}
      />
    );
  }

  if (isUser) {
    // User bubble: same Markdown pipeline as assistant — `@mention`
    // serialisation `[MUL-1](mention://issue/<id>)`, inline links, and
    // inline code resolve identically to web's
    // `packages/views/chat/components/chat-message-list.tsx` user branch.
    // Width is capped at 80% so the bubble keeps the iMessage-style
    // trailing alignment instead of stretching across the column.
    const body = (
      <View
        className={cn(
          "self-end max-w-[80%] min-w-0 gap-1.5 overflow-hidden rounded-xl border-2 px-3.5 py-2 transition-colors",
          isSelecting
            ? "bg-primary/5 border-primary/30"
            : longPress.isPressed
              ? "bg-muted border-primary/30"
              : "bg-muted border-transparent",
        )}
        style={continuousCorners}
      >
        <Markdown
          content={message.content}
          attachments={message.attachments}
          selectable={isSelecting}
          compact
        />
        <CommentAttachmentList
          attachments={message.attachments}
          content={message.content}
        />
      </View>
    );
    if (isSelecting) return body;
    return (
      <Pressable
        onLongPress={longPress.onLongPress}
        delayLongPress={500}
      >
        {body}
      </Pressable>
    );
  }

  // Assistant: timeline fold + markdown + elapsed caption. See
  // AssistantRow for why timeline is lifted into its own component.
  return (
    <AssistantRow
      message={message}
      isSelecting={isSelecting}
      longPress={longPress}
      onQuickAction={onQuickAction}
      quickActionsDisabled={quickActionsDisabled}
    />
  );
}

/**
 * Persisted assistant message. Renders:
 *
 *   - Process-steps fold (from `task-messages` cache; same cache fed by
 *     the live timeline above, so completed runs keep their trace).
 *   - Markdown content (the model's final answer).
 *   - "Replied in Ns" caption when `elapsed_ms` is stamped.
 *
 * Web's equivalent is `AssistantMessage` in packages/views/chat/components/
 * chat-message-list.tsx — same shape, simplified for RN (no inner Tooltip
 * / Copy button — long-press already exposes Copy via the native action
 * sheet, and selection mode owns the highlight, so a hover-only Copy
 * affordance would be redundant on mobile).
 */
function AssistantRow({
  message,
  isSelecting,
  longPress,
  onQuickAction,
  quickActionsDisabled,
}: {
  message: ChatMessage;
  isSelecting: boolean;
  longPress: ReturnType<typeof useChatMessageLongPress>;
  onQuickAction?: (action: ChatQuickAction) => void | Promise<unknown>;
  quickActionsDisabled: boolean;
}) {
  // Read the cached timeline if any. `enabled` (in taskMessagesOptions) is
  // gated on isTaskMessageTaskId — optimistic id prefixes never fetch, so
  // freshly-sent messages don't spam the API while waiting for the real
  // task_id to land. Cached cells (after live timeline finished) return
  // synchronously with no network roundtrip.
  const { data: timeline = [] } = useQuery(
    taskMessagesOptions(message.task_id),
  );
  // no_response (MUL-4351, mirrors packages/views AssistantMessage): the agent
  // completed this turn without text. Keep the tool timeline and show a notice
  // instead of an empty Markdown block; caption reads "Finished in" not
  // "Replied in".
  const isNoResponse = message.message_kind === "no_response";
  const { t } = useT("chat");
  const body = (
    <View className="gap-1.5">
      {timeline.length > 0 ? (
        <ChatTimeline items={timeline} />
      ) : null}
      {isNoResponse ? (
        <Text className="text-sm italic text-muted-foreground">
          {t("no_response")}
        </Text>
      ) : (
        <Markdown
          content={message.content}
          attachments={message.attachments}
          selectable={isSelecting}
        />
      )}
      {/* Standalone attachment cards for anything not referenced inline. An
          image-only reply is a real ('message') outcome with empty content, so
          it flows through the else-branch above (renders nothing) and the cards
          here ARE the reply. */}
      <CommentAttachmentList
        attachments={message.attachments}
        content={message.content}
      />
      {message.elapsed_ms != null ? (
        <ElapsedCaption
          variant={isNoResponse ? "finished" : "replied"}
          elapsedMs={message.elapsed_ms}
        />
      ) : null}
    </View>
  );
  const messageBody = isSelecting ? body : (
    <Pressable onLongPress={longPress.onLongPress} delayLongPress={500}>
      {body}
    </Pressable>
  );
  if (!onQuickAction || (message.quick_actions?.length ?? 0) === 0) {
    return messageBody;
  }
  return (
    <View className="gap-2">
      {messageBody}
      <QuickActions
        actions={message.quick_actions ?? []}
        disabled={quickActionsDisabled}
        onSelect={onQuickAction}
      />
    </View>
  );
}

function QuickActions({
  actions,
  disabled,
  onSelect,
}: {
  actions: ChatQuickAction[];
  disabled: boolean;
  onSelect: (action: ChatQuickAction) => void | Promise<unknown>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const { t } = useT("chat");
  const blocked = disabled || submitting;

  const handleSelect = async (action: ChatQuickAction) => {
    if (blocked) return;
    setSubmitting(true);
    try {
      await onSelect(action);
    } catch {
      // The send path rolls back its optimistic message. Keep the action usable
      // so a transient request failure can be retried.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View
      className="flex-row flex-wrap gap-2 pt-0.5"
      accessibilityLabel={t("a11y.suggested_followups")}
    >
      {actions.slice(0, 3).map((action, index) => (
        <Pressable
          key={`${action.label}-${index}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: blocked }}
          disabled={blocked}
          onPress={() => void handleSelect(action)}
          className={cn(
            "min-h-10 max-w-full flex-row items-center gap-1 rounded-full border px-3 active:opacity-70",
            action.primary
              ? "border-primary/30 bg-primary/10"
              : "border-border bg-background",
            blocked && "opacity-50",
          )}
        >
          <Text
            numberOfLines={1}
            className={cn(
              "shrink text-sm font-medium",
              action.primary ? "text-primary" : "text-foreground",
            )}
          >
            {action.label}
          </Text>
          {action.primary ? (
            <Text className="text-sm font-medium text-primary">↗</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

// Persistent caption rendered under the assistant bubble / failure bubble
// once the server has written `elapsed_ms`. Server computes once at task
// completion, so this caption is identical across reloads and clients.
function ElapsedCaption({
  variant,
  elapsedMs,
}: {
  variant: "replied" | "failed" | "finished";
  elapsedMs: number;
}) {
  const { t } = useT("chat");
  const label =
    variant === "replied"
      ? t("elapsed.replied", { time: formatElapsedMs(elapsedMs) })
      : variant === "finished"
        ? t("elapsed.finished", { time: formatElapsedMs(elapsedMs) })
        : t("elapsed.failed", { time: formatElapsedMs(elapsedMs) });
  return (
    <Text className="text-xs text-muted-foreground/80 mt-1">{label}</Text>
  );
}

function FailureBubble({
  reasonLabel,
  rawError,
  elapsedMs,
  isSelecting,
  longPress,
}: {
  reasonLabel: string;
  rawError: string;
  elapsedMs: number | null;
  isSelecting: boolean;
  longPress: ReturnType<typeof useChatMessageLongPress>;
}) {
  const hasRawError = rawError.trim().length > 0;
  const { t } = useT("chat");

  // B6: pass `selectable={isSelecting}` rather than hard-coding
  // `selectable` — otherwise UIKit's text-selection gesture pre-empts
  // our long-press handler and the action sheet never fires. Select-mode
  // cue is the border-tint to primary; bg stays destructive so the
  // failure signal is never lost.
  const body = (
    <View className="self-start max-w-[80%]">
      <View
        className={cn(
          "rounded-xl border-2 bg-destructive/10 px-3.5 py-2 transition-colors",
          isSelecting || longPress.isPressed
            ? "border-primary/30"
            : "border-destructive/30",
        )}
        style={continuousCorners}
      >
        <Text className="text-xs font-semibold text-destructive">
          {reasonLabel}
        </Text>
        {hasRawError ? (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <View
                accessibilityRole="button"
                accessibilityLabel={t("a11y.show_error_details")}
                className="mt-1 flex-row items-center gap-1 active:opacity-70"
              >
                <Ionicons
                  name="chevron-forward"
                  size={12}
                  color="#71717a"
                />
                <Text className="text-xs text-muted-foreground">
                  {t("details.show")}
                </Text>
              </View>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <View className="mt-1 rounded-xs bg-muted/40 px-2 py-1.5">
                <Text
                  className="text-xs text-muted-foreground"
                  selectable={isSelecting}
                >
                  {rawError}
                </Text>
              </View>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </View>
      {elapsedMs != null ? (
        <ElapsedCaption variant="failed" elapsedMs={elapsedMs} />
      ) : null}
    </View>
  );
  if (isSelecting) return body;
  return (
    <Pressable onLongPress={longPress.onLongPress} delayLongPress={500}>
      {body}
    </Pressable>
  );
}
