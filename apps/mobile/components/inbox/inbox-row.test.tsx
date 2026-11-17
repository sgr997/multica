// @vitest-environment node
import { isValidElement, type ReactElement } from "react";
import type { InboxItem } from "@multica/core/types";
import { describe, expect, it, vi } from "vitest";
import { InboxRow } from "@/components/inbox/inbox-row";

vi.mock("react-native", () => ({ Pressable: "Pressable", View: "View" }));
vi.mock("@/components/ui/text", () => ({ Text: "Text" }));
vi.mock("@/components/ui/actor-avatar", () => ({ ActorAvatar: "ActorAvatar" }));
vi.mock("@/components/ui/status-icon", () => ({ StatusIcon: "StatusIcon" }));
vi.mock("@/components/inbox/detail-label", () => ({
  InboxDetailLabel: "InboxDetailLabel",
}));
vi.mock("@/lib/inbox-display", () => ({
  getInboxDisplayTitle: (item: InboxItem) => item.title,
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/use-issue-statuses", () => ({
  useIssueStatuses: () => ({
    categoryOf: () => "todo",
    colorOf: () => null,
    iconOf: () => "ellipse-outline",
  }),
}));
vi.mock("@/lib/time-ago", () => ({ timeAgo: () => "now" }));

type Element = ReactElement<Record<string, unknown> & { children?: unknown }>;

// Headless tree walk: no RN renderer in this suite (see vitest.config.ts), so
// function components are expanded by calling them and host elements kept.
function flatten(node: unknown, out: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const child of node) flatten(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  const element = node as Element;
  if (typeof element.type === "function") {
    return flatten(
      (element.type as (props: unknown) => unknown)(element.props),
      out,
    );
  }
  out.push(element);
  flatten(element.props.children, out);
  return out;
}

function item(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: "item-1",
    workspace_id: "workspace-1",
    recipient_type: "member",
    recipient_id: "member-1",
    actor_type: "agent",
    actor_id: "agent-1",
    type: "new_comment",
    severity: "info",
    issue_id: "issue-1",
    title: "A very long issue title that would otherwise truncate",
    body: null,
    issue_status: "todo",
    read: false,
    archived: false,
    created_at: "2026-06-15T08:01:00Z",
    details: null,
    ...overrides,
  };
}

function render(row: InboxItem, unreadCount = 0) {
  return flatten(
    InboxRow({ item: row, unreadCount, onPress: () => {} }),
  );
}

function unreadDots(elements: Element[]) {
  return elements.filter(
    (element) =>
      element.type === "View" &&
      typeof element.props.className === "string" &&
      element.props.className.includes("size-2") &&
      element.props.className.includes("rounded-full") &&
      element.props.className.includes("bg-brand"),
  );
}

describe("InboxRow unread marker", () => {
  it("renders an 8px dot instead of a numeric badge when unread", () => {
    const elements = render(item({ read: false }), 3);

    expect(unreadDots(elements)).toHaveLength(1);
    const numeric = elements.filter(
      (element) =>
        element.type === "Text" &&
        typeof element.props.children === "number",
    );
    expect(numeric).toEqual([]);
    expect(
      elements.some(
        (element) =>
          element.type === "Text" &&
          typeof element.props.children === "string" &&
          /^\d+\+?$/.test(element.props.children),
      ),
    ).toBe(false);
  });

  it("renders no marker on a read row", () => {
    expect(unreadDots(render(item({ read: true }), 0))).toEqual([]);
  });

  it("keeps the unread count readable for assistive tech", () => {
    const unreadTitle = render(item({ read: false }), 3).find(
      (element) =>
        element.type === "Text" &&
        element.props.accessibilityLabel !== undefined,
    );
    expect(unreadTitle?.props.accessibilityLabel).toBe(
      `${item().title}, row.unread_count`,
    );

    const readTitle = render(item({ read: true })).find(
      (element) =>
        element.type === "Text" &&
        element.props.accessibilityLabel !== undefined,
    );
    expect(readTitle?.props.accessibilityLabel).toBe(item().title);
  });
});
