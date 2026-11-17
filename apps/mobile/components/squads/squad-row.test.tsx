// @vitest-environment node
import { isValidElement, type ReactElement } from "react";
import type { Squad } from "@multica/core/types";
import { describe, expect, it, vi } from "vitest";
import { SquadRow } from "@/components/squads/squad-row";

vi.mock("react-native", () => ({
  Image: "Image",
  Pressable: "Pressable",
  View: "View",
}));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("@/components/ui/text", () => ({ Text: "Text" }));
vi.mock("@/components/ui/actor-avatar", () => ({ ActorAvatar: "ActorAvatar" }));
vi.mock("@/lib/use-color-scheme", () => ({
  useColorScheme: () => ({ colorScheme: "light" }),
}));
vi.mock("@/lib/theme", () => ({
  THEME: {
    light: { foreground: "#111", mutedForeground: "#777" },
    dark: { foreground: "#eee", mutedForeground: "#999" },
  },
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => ({
    t: (key: string, params?: { count?: number }) =>
      params?.count === undefined ? key : `${key}:${params.count}`,
  }),
}));

type Element = ReactElement<Record<string, unknown> & { children?: unknown }>;

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

function textOf(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") {
    return [String(node)];
  }
  if (Array.isArray(node)) return node.flatMap(textOf);
  if (!isValidElement(node)) return [];
  return textOf((node.props as { children?: unknown }).children);
}

function squad(overrides: Partial<Squad> = {}): Squad {
  return {
    id: "squad-1",
    workspace_id: "workspace-1",
    name: "Multica 维护",
    description: "",
    instructions: "",
    avatar_url: null,
    leader_id: "agent-1",
    creator_id: "member-1",
    created_at: "2026-06-15T08:00:00Z",
    updated_at: "2026-06-15T08:00:00Z",
    archived_at: null,
    archived_by: null,
    member_count: 3,
    member_preview: [
      { member_type: "agent", member_id: "agent-1", role: "leader" },
      { member_type: "agent", member_id: "agent-2", role: "ops" },
      { member_type: "member", member_id: "member-1", role: "review" },
    ],
    ...overrides,
  };
}

describe("SquadRow", () => {
  it("renders identity, count, leader and a neutral dot status", () => {
    const elements = flatten(
      SquadRow({
        squad: squad(),
        leaderName: "Mika",
        status: "idle",
        onPress: () => {},
      }),
    );
    const text = elements.flatMap((element) => textOf(element.props.children));

    expect(text).toContain("Multica 维护");
    expect(text).toContain("list.member_count:3");
    expect(text).toContain(" · 👑 Mika");
    expect(text).toContain("status.idle");
    expect(
      elements.some((element) =>
        String(element.props.className ?? "").includes("bg-info"),
      ),
    ).toBe(true);
    expect(
      elements.some(
        (element) =>
          element.type === "Ionicons" &&
          element.props.name === "chevron-forward",
      ),
    ).toBe(true);
  });

  it("caps the avatar stack at two plus an overflow count", () => {
    const elements = flatten(
      SquadRow({
        squad: squad(),
        leaderName: "Mika",
        status: "working",
        onPress: () => {},
      }),
    );
    const avatars = elements.filter(
      (element) => element.type === "ActorAvatar",
    );
    const text = elements.flatMap((element) => textOf(element.props.children));

    expect(avatars).toHaveLength(2);
    expect(text.join("")).toContain("+1");
  });
});
