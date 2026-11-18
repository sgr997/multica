// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Alert } from "react-native";
import ChatTab from "@/app/(app)/[workspace]/(tabs)/chat";
import { api } from "@/data/api";
import { seedAcceptedPendingTask } from "@/data/realtime/chat-ws-updaters";

const state = vi.hoisted(() => ({
  agents: [] as unknown[],
  pendingTask: undefined as unknown,
  setters: [] as ReturnType<typeof vi.fn>[],
  hookIndex: 0,
  sendMessage: vi.fn(),
  createSession: vi.fn(),
  setQueryData: vi.fn(),
  getQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
}));

const agent = {
  id: "agent-1",
  name: "Agent",
  archived_at: null,
  runtime_id: "runtime-1",
};

const runningTask = {
  task_id: "task-running",
  status: "running",
  supports_queue: true,
  created_at: "2026-11-13T09:00:00Z",
  queued_tasks: [],
};

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useCallback: (callback: unknown) => callback,
  useMemo: (create: () => unknown) => create(),
  useEffect: () => {},
  useRef: (initial: unknown) => ({ current: initial }),
  useState: (initial: unknown) => {
    const index = state.hookIndex++;
    const setter = state.setters[index] ?? vi.fn();
    state.setters[index] = setter;
    return [initial, setter];
  },
}));
vi.mock("react-native", () => ({
  ActionSheetIOS: { showActionSheetWithOptions: vi.fn() },
  Alert: { alert: vi.fn() },
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "ios" },
  Pressable: "Pressable",
  View: "View",
}));
vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueryData: state.setQueryData,
    getQueryData: state.getQueryData,
    invalidateQueries: state.invalidateQueries,
  }),
  useQuery: (options: { queryKey: unknown[] }) => {
    switch (options.queryKey[0]) {
      case "agents":
        return { data: state.agents };
      case "pending":
        return { data: state.pendingTask };
      case "messages":
        return { data: [], isLoading: false };
      case "task-messages":
        return { data: [] };
      default:
        return { data: [] };
    }
  },
}));
vi.mock("@multica/core/chat/session-list", () => ({
  refetchChatSessionsAfterCommit: vi.fn(),
}));
vi.mock("@multica/core/permissions/rules", () => ({
  canAssignAgentToIssue: () => ({ allowed: true }),
}));
vi.mock("@/data/api", () => ({
  api: {
    sendChatMessage: state.sendMessage,
    prioritizeQueuedChatTask: vi.fn(),
    cancelTaskById: vi.fn(),
    clearQueuedChatTasks: vi.fn(),
  },
  ApiError: class extends Error {},
}));
vi.mock("@/data/auth-store", () => ({
  useAuthStore: (selector: (value: unknown) => unknown) =>
    selector({ user: { id: "user-1" } }),
}));
vi.mock("@/data/workspace-store", () => ({
  useWorkspaceStore: (selector: (value: unknown) => unknown) =>
    selector({ currentWorkspaceId: "workspace-1", currentWorkspaceSlug: "acme" }),
}));
vi.mock("@/data/queries/agents", () => ({
  agentListOptions: () => ({ queryKey: ["agents"] }),
}));
vi.mock("@/data/queries/members", () => ({
  memberListOptions: () => ({ queryKey: ["members"] }),
}));
vi.mock("@/data/queries/chat", () => ({
  chatKeys: {
    pendingTask: (sessionId: string | null) => ["pending", sessionId],
    messages: (sessionId: string | null) => ["messages", sessionId],
    sessions: (workspaceId: string | null) => ["sessions", workspaceId],
  },
  chatSessionsOptions: () => ({ queryKey: ["sessions"] }),
  chatMessagesOptions: () => ({ queryKey: ["messages"] }),
  pendingChatTaskOptions: () => ({ queryKey: ["pending"] }),
  taskMessagesOptions: () => ({ queryKey: ["task-messages"] }),
}));
vi.mock("@/data/mutations/chat", () => ({
  useCreateChatSession: () => ({ mutateAsync: state.createSession }),
  useDeleteChatSession: () => ({ mutate: vi.fn() }),
  useMarkChatSessionRead: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/data/stores/chat-drafts-store", () => ({
  DRAFT_NEW_SESSION: "__new__",
  useChatDraftsStore: (selector: (value: unknown) => unknown) =>
    selector({
      drafts: {},
      setDraft: vi.fn(),
      clearDraft: vi.fn(),
      promoteNewDraft: vi.fn(),
    }),
}));
vi.mock("@/data/stores/chat-session-picker-store", () => ({
  useChatSessionPickerStore: (selector: (value: unknown) => unknown) =>
    selector({
      setActiveSessionId: vi.fn(),
      selectRequest: null,
      consumeSelect: vi.fn(),
    }),
}));
vi.mock("@/data/realtime/use-chat-session-realtime", () => ({
  useChatSessionRealtime: vi.fn(),
}));
vi.mock("@/data/realtime/use-chat-refresh-fallback", () => ({
  useChatRefreshFallback: vi.fn(),
}));
vi.mock("@/data/realtime/chat-ws-updaters", () => ({
  invalidatePendingTask: vi.fn(),
  seedAcceptedPendingTask: vi.fn(),
}));
vi.mock("@/lib/workspace-agent-availability", () => ({
  useWorkspaceAgentAvailability: () => "available",
}));
vi.mock("@/lib/dispatch-reason", () => ({
  dispatchReasonCode: () => undefined,
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/use-agent-presence", () => ({
  useAgentPresence: () => ({ availability: "available" }),
}));
vi.mock("@/lib/is-agent-runtime-bound", () => ({
  isAgentRuntimeBound: () => true,
}));
vi.mock("@/components/ui/header", () => ({ Header: "Header" }));
vi.mock("@/components/ui/text", () => ({ Text: "Text" }));
vi.mock("@/components/chat/chat-title-button", () => ({
  ChatTitleButton: "ChatTitleButton",
}));
vi.mock("@/components/chat/chat-session-actions", () => ({
  ChatSessionActions: "ChatSessionActions",
}));
vi.mock("@/components/chat/chat-message-list", () => ({
  ChatMessageList: "ChatMessageList",
}));
vi.mock("@/components/chat/chat-composer", () => ({
  ChatComposer: "ChatComposer",
}));
vi.mock("@/components/chat/chat-queue", () => ({
  ChatQueue: "ChatQueue",
}));
vi.mock("@/components/chat/agent-picker-sheet", () => ({
  AgentPickerSheet: "AgentPickerSheet",
}));
vi.mock("@/components/chat/no-agent-banner", () => ({
  NoAgentBanner: "NoAgentBanner",
}));
vi.mock("@/components/chat/offline-banner", () => ({
  OfflineBanner: "OfflineBanner",
}));
vi.mock("@/components/chat/runtime-required-banner", () => ({
  RuntimeRequiredBanner: "RuntimeRequiredBanner",
}));

interface ElementLike {
  type?: unknown;
  props?: Record<string, unknown> & { children?: unknown };
}

function findElement(node: unknown, type: string): ElementLike | null {
  if (node === null || typeof node !== "object") return null;
  const element = node as ElementLike;
  if (element.type === type) return element;
  const children = element.props?.children;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    const found = findElement(child, type);
    if (found) return found;
  }
  return null;
}

function composerProps(): Record<string, unknown> {
  state.hookIndex = 0;
  const composer = findElement(ChatTab(), "ChatComposer");
  if (!composer?.props) throw new Error("composer not rendered");
  return composer.props;
}

describe("chat send while the agent is running", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.agents = [agent];
    state.pendingTask = runningTask;
    state.hookIndex = 0;
    state.createSession.mockResolvedValue({ id: "session-1" });
    state.sendMessage.mockResolvedValue({
      message_id: "message-1",
      task_id: "task-1",
      created_at: "2026-11-13T09:01:00Z",
      queued: true,
      supports_queue: true,
    });
    state.getQueryData.mockReturnValue(runningTask);
  });

  it("queues the message without any confirmation interaction", async () => {
    const props = composerProps();
    expect(props.allowSubmitWhileRunning).toBe(true);

    await (props.onSend as (content: string) => Promise<void>)("follow up");

    expect(state.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "session-1",
      "follow up",
      { attachmentIds: undefined },
    );
    expect(seedAcceptedPendingTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ task_id: "task-1", queued: true }),
    );
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(api.prioritizeQueuedChatTask).not.toHaveBeenCalled();
  });

  it("keeps the composer closed while running when the server cannot queue", () => {
    state.pendingTask = { ...runningTask, supports_queue: undefined };
    expect(composerProps().allowSubmitWhileRunning).toBe(false);
  });

  it("still restores the draft and retry state when the send fails", async () => {
    state.sendMessage.mockRejectedValueOnce(new Error("offline"));
    const props = composerProps();
    const failedSendSetter = state.setters[3];

    await expect(
      (props.onSend as (content: string) => Promise<void>)("follow up"),
    ).rejects.toThrow("offline");

    expect(failedSendSetter).toHaveBeenCalledWith(
      expect.objectContaining({ content: "follow up", attachmentIds: [] }),
    );
    expect(state.sendMessage).toHaveBeenCalledOnce();
  });
});
