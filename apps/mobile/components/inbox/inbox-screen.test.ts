// @vitest-environment node
import type { InboxItem } from "@multica/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { router } from "expo-router";
import Inbox from "@/app/(app)/[workspace]/(tabs)/inbox";

const state = vi.hoisted(() => ({
  rows: [] as InboxItem[],
  markRead: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useMemo: (create: () => unknown) => create(),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("react-native", () => ({
  ActionSheetIOS: {}, Alert: {}, FlatList: "FlatList", View: "View",
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.rows, refetch: state.refetch }),
}));
vi.mock("@/data/queries/inbox", () => ({ inboxListOptions: vi.fn() }));
vi.mock("@/data/mutations/inbox", () => {
  const mutation = () => ({ mutate: vi.fn() });
  return {
    useMarkInboxRead: () => ({ mutate: state.markRead }),
    useMarkAllInboxRead: mutation,
    useArchiveInbox: mutation,
    useArchiveAllInbox: mutation,
    useArchiveAllReadInbox: mutation,
    useArchiveCompletedInbox: mutation,
  };
});
vi.mock("@/data/workspace-store", () => ({
  useWorkspaceStore: (selector: (value: unknown) => unknown) => selector({
    currentWorkspaceId: "workspace-1", currentWorkspaceSlug: "acme",
  }),
}));
vi.mock("@/lib/use-color-scheme", () => ({ useColorScheme: () => ({ colorScheme: "light" }) }));
vi.mock("@/lib/use-refresh-with-haptics", () => ({
  useRefreshWithHaptics: (refresh: unknown) => ({
    refreshing: false,
    onRefresh: refresh,
  }),
}));
vi.mock("@/lib/theme", () => ({ THEME: { light: { mutedForeground: "gray" } } }));
vi.mock("@/lib/i18n", () => ({ useT: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/ui/text", () => ({ Text: "Text" }));
vi.mock("@/components/ui/button", () => ({ Button: "Button" }));
vi.mock("@/components/ui/skeleton", () => ({ Skeleton: "Skeleton" }));
vi.mock("@/components/ui/header", () => ({ Header: "Header" }));
vi.mock("@/components/ui/icon-button", () => ({ IconButton: "IconButton" }));
vi.mock("@/components/ui/app-header-actions", () => ({ HeaderActions: "HeaderActions" }));
vi.mock("@/components/inbox/swipeable-inbox-row", () => ({ SwipeableInboxRow: "SwipeableInboxRow" }));
vi.mock("@/components/inbox/inbox-toast", () => ({ InboxToast: "InboxToast" }));

describe("Inbox navigation wiring", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([true, false])("reads the whole issue before navigation when the latest row read=%s", (read) => {
    const comment: InboxItem = {
      id: "comment", workspace_id: "workspace-1", recipient_type: "member",
      recipient_id: "member-1", actor_type: "agent", actor_id: "agent-1",
      type: "new_comment", severity: "info", issue_id: "issue-1", title: "Issue",
      body: null, issue_status: "todo", read, archived: false,
      created_at: "2026-06-15T08:01:00Z", details: null,
    };
    state.rows = [comment, {
      ...comment, id: "assigned", type: "issue_assigned", severity: "action_required",
      read: false, created_at: "2026-06-15T08:00:00Z",
    }];

    // Inspect props and invoke the tap callback without rendering native UI.
    const list = Inbox().props.children[1];
    expect(list.props.data).toEqual([comment]);
    // Pull-to-refresh must be reachable from the blank area below the rows,
    // not only from the rows themselves.
    expect(list.props.style).toEqual({ flex: 1 });
    expect(list.props.contentContainerClassName).toContain("grow");
    expect(list.props.alwaysBounceVertical).toBe(true);
    list.props.renderItem({ item: comment }).props.onPress();

    expect(state.markRead).toHaveBeenCalledExactlyOnceWith("comment");
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({
      pathname: "/[workspace]/issue/[id]",
      params: expect.objectContaining({ workspace: "acme", id: "issue-1" }),
    }));
    expect(state.markRead.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(router.push).mock.invocationCallOrder[0]!);
  });

  it("keeps an empty inbox inside the refreshable list", () => {
    state.rows = [];

    const list = Inbox().props.children[1];
    expect(list.props.data).toEqual([]);
    // The empty state used to replace the list, which left the whole screen
    // with no pull gesture at all.
    expect(list.props.ListEmptyComponent).toBeTruthy();
    expect(list.props.onRefresh).toBeTypeOf("function");
  });
});
