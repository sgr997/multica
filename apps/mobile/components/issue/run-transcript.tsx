import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColorScheme } from "nativewind";
import type { AgentTask, TaskMessagePayload } from "@multica/core/types";
import { redactSecrets } from "@multica/core/security/redact-secrets";
import { Text } from "@/components/ui/text";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Markdown } from "@/lib/markdown";
import { useT } from "@/lib/i18n";
import {
  buildRunTranscriptEntries,
  getRunDiagnostics,
  isCancellableRunStatus,
  runToolContext,
} from "@/lib/run-transcript";
import type { RunTranscriptEntry } from "@/lib/run-transcript";
import {
  isAtBottom,
  shouldAutoScrollToLatest,
  type ChatScrollMetrics,
} from "@/lib/chat-scroll-follow";
import { THEME } from "@/lib/theme";

const DISPLAY_CLIP_CHARS = 8_000;

export function RunTranscript({
  items,
  task,
  header,
}: {
  items: readonly TaskMessagePayload[];
  task: AgentTask;
  header: React.ReactElement;
}) {
  const { t } = useT("issues");
  const timeline = useMemo(() => buildRunTranscriptEntries(items), [items]);
  const diagnostics = getRunDiagnostics(task);

  // ── Follow the live tail ───────────────────────────────────────────────
  //
  // An active run's transcript grows while it is on screen. Keep the viewport
  // pinned to the newest entry, but never move it under a reader who scrolled
  // up: same intent-not-geometry rule as the chat list (`chat-scroll-follow`).
  // Completed runs open at the top — there is nothing new coming, and a log's
  // beginning is what someone opening a finished record wants.
  const isActive = isCancellableRunStatus(task.status);
  const listRef = useRef<FlatList<RunTranscriptEntry>>(null);
  const followingRef = useRef(isActive);
  const userInteractingRef = useRef(false);
  const hasAutoScrolledRef = useRef(false);
  const metricsRef = useRef<ChatScrollMetrics>({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0,
  });

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      metricsRef.current = {
        contentHeight: contentSize.height,
        offsetY: contentOffset.y,
        viewportHeight: layoutMeasurement.height,
      };
      // Programmatic scrolls and content growth report offsets too; only a
      // gesture the user owns may change the follow intent.
      if (!userInteractingRef.current) return;
      followingRef.current = isAtBottom(metricsRef.current);
    },
    [],
  );

  const startUserInteraction = useCallback(() => {
    userInteractingRef.current = true;
  }, []);

  const settleFollowState = useCallback(() => {
    userInteractingRef.current = false;
    followingRef.current = isAtBottom(metricsRef.current);
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (
      !shouldAutoScrollToLatest({
        following: followingRef.current,
        userInteracting: userInteractingRef.current,
        lastMessageIsUser: false,
      })
    ) {
      return;
    }
    // Opening a live run jumps to the tail without animating through the
    // whole record; later arrivals ease in.
    const animated = hasAutoScrolledRef.current;
    hasAutoScrolledRef.current = true;
    listRef.current?.scrollToEnd({ animated });
  }, []);

  return (
    <FlatList
      ref={listRef}
      className="flex-1"
      contentContainerClassName="px-4 py-4"
      data={timeline}
      keyExtractor={(item, index) => `${item.task_id}-${item.seq}-${index}`}
      renderItem={({ item }) => <TranscriptEntry item={item} />}
      ItemSeparatorComponent={EntrySeparator}
      ListHeaderComponent={
        <View className="mb-4 gap-4">
          {header}
          {diagnostics ? (
            <View className={`gap-2 rounded-lg border px-3 py-3 ${
              task.status === "failed" ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
            }`}>
              {diagnostics.reasonKey ? (
                <Text className="text-sm font-medium text-destructive">
                  {t(`chat:${diagnostics.reasonKey}`)}
                </Text>
              ) : null}
              {diagnostics.error ? (
                <View className="gap-1">
                  <Text className="text-xs font-medium text-muted-foreground">
                    {t("runs.transcript.diagnostics")}
                  </Text>
                  <Text selectable className="font-mono text-xs text-foreground">
                    {diagnostics.error}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        diagnostics ? null : (
          <View className="items-center rounded-lg border border-dashed border-border px-4 py-8">
            <Text className="text-sm text-muted-foreground">
              {t("runs.transcript.empty")}
            </Text>
          </View>
        )
      }
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onScrollBeginDrag={startUserInteraction}
      onMomentumScrollBegin={startUserInteraction}
      onScrollEndDrag={settleFollowState}
      onMomentumScrollEnd={settleFollowState}
      onContentSizeChange={handleContentSizeChange}
    />
  );
}

function EntrySeparator() {
  return <View className="h-2" />;
}

function TranscriptEntry({ item: entry }: { item: RunTranscriptEntry }) {
  if (entry.kind === "tool") return <ToolEntry call={entry.call} result={entry.result} />;
  const item = entry.message;
  switch (item.type) {
    case "thinking":
      return (
        <EntryCard icon="bulb-outline" labelKey="thinking" collapsible>
          <Text selectable className="text-sm italic text-muted-foreground">
            {item.content || "—"}
          </Text>
        </EntryCard>
      );
    case "error":
      return (
        <EntryCard icon="alert-circle-outline" labelKey="error" destructive>
          <Text selectable className="text-sm text-destructive">
            {item.content || "—"}
          </Text>
        </EntryCard>
      );
    case "text":
    default:
      return (
        <EntryCard icon="chatbubble-ellipses-outline" labelKey="output">
          {item.content ? (
            <Markdown content={item.content} />
          ) : (
            <Text className="text-sm text-muted-foreground">—</Text>
          )}
        </EntryCard>
      );
  }
}

function ToolEntry({ call, result }: { call?: TaskMessagePayload; result?: TaskMessagePayload }) {
  const { t } = useT("issues");
  const input =
    call?.input && Object.keys(call.input).length > 0
      ? redactSecrets(JSON.stringify(call.input, null, 2))
      : "—";
  const detail = [call?.tool || result?.tool || t("runs.transcript.unknown_tool"), runToolContext(call)]
    .filter(Boolean).join(" · ");

  return (
    <EntryCard
      icon={call ? "construct-outline" : "terminal-outline"}
      labelKey={call ? "tool_call" : "tool_output"}
      detail={detail}
      collapsible
    >
      <View className="gap-2">
        {call ? (
          <View className="rounded-md bg-muted px-3 py-2">
            <Text selectable className="font-mono text-xs text-muted-foreground">
              {input}
            </Text>
          </View>
        ) : null}
        {result ? <ToolResultContent item={result} /> : null}
      </View>
    </EntryCard>
  );
}

function ToolResultContent({ item }: { item: TaskMessagePayload }) {
  const { t } = useT("issues");
  const [showFullOutput, setShowFullOutput] = useState(false);
  const output = item.output ?? "";
  const clipped = output.length > DISPLAY_CLIP_CHARS;
  const shown = clipped && !showFullOutput
    ? `${output.slice(0, DISPLAY_CLIP_CHARS)}...`
    : output;

  return (
    <View className="gap-2">
      <Text className="text-xs font-medium text-muted-foreground">
        {t("runs.transcript.tool_output")}
      </Text>
      <View className="rounded-md bg-muted px-3 py-2">
        <Text selectable className="font-mono text-xs text-muted-foreground">
          {shown || "—"}
        </Text>
      </View>
      {clipped ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowFullOutput(!showFullOutput)}
          className="mt-2 py-1"
        >
          <Text className="text-sm text-brand">
            {t(showFullOutput ? "runs.transcript.show_less" : "runs.transcript.show_full_output")}
          </Text>
        </Pressable>
      ) : null}
      {item.output_truncated === true ? (
        <Text className="mt-2 text-xs text-muted-foreground">
          {t("runs.transcript.truncated")}
        </Text>
      ) : null}
    </View>
  );
}

function EntryCard({
  icon,
  labelKey,
  detail,
  destructive = false,
  collapsible = false,
  children,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  labelKey: "thinking" | "error" | "output" | "tool_call" | "tool_output";
  detail?: string;
  destructive?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useT("issues");
  const [open, setOpen] = useState(false);
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const className = `rounded-lg border px-3 py-3 ${
    destructive ? "border-destructive/30 bg-destructive/5" : "border-border bg-card"
  }`;
  const heading = (
    <>
      <Ionicons name={icon} size={14} color={destructive ? theme.destructive : theme.mutedForeground} />
      <Text numberOfLines={2} className={`flex-1 text-xs font-medium ${destructive ? "text-destructive" : "text-muted-foreground"}`}>
        {t(`runs.transcript.${labelKey}`)}{detail ? ` · ${detail}` : ""}
      </Text>
    </>
  );

  if (collapsible) {
    return (
      <Collapsible open={open} onOpenChange={setOpen} className={className}>
        <CollapsibleTrigger className="flex-row items-center gap-2">
          {heading}
          <Ionicons
            name={open ? "chevron-down" : "chevron-forward"}
            size={14}
            color={theme.mutedForeground}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">{children}</CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <View className={className}>
      <View className="mb-2 flex-row items-center gap-2">{heading}</View>
      {children}
    </View>
  );
}
