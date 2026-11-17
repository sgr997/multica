// @vitest-environment node
import { isValidElement, type ReactElement } from "react";
import type { SquadMember } from "@multica/core/types";
import { describe, expect, it, vi } from "vitest";
import {
  SquadMemberRow,
  squadMemberRoleLabel,
} from "@/components/squads/squad-member-row";

vi.mock("react-native", () => ({
  Image: "Image",
  Pressable: "Pressable",
  View: "View",
}));
vi.mock("@/components/ui/text", () => ({ Text: "Text" }));
vi.mock("@/components/ui/actor-avatar", () => ({ ActorAvatar: "ActorAvatar" }));
vi.mock("@/components/ui/icon-button", () => ({ IconButton: "IconButton" }));
vi.mock("@/lib/i18n", () => ({
  useT: () => ({
    t: (key: string, params?: { name?: string }) =>
      params?.name ? `${key}:${params.name}` : key,
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

function member(overrides: Partial<SquadMember> = {}): SquadMember {
  return {
    id: "member-row-1",
    squad_id: "squad-1",
    member_type: "agent",
    member_id: "agent-1",
    role: "leader",
    created_at: "2026-06-15T08:00:00Z",
    ...overrides,
  };
}

describe("squadMemberRoleLabel", () => {
  it("localizes the leader label instead of showing the raw stored role", () => {
    expect(squadMemberRoleLabel(true, "leader", "负责人", "添加角色…")).toBe(
      "负责人",
    );
  });

  it("keeps the free-text role for regular members", () => {
    expect(
      squadMemberRoleLabel(false, "运维与发布", "负责人", "添加角色…"),
    ).toBe("运维与发布");
  });

  it("uses the add-role placeholder only when the role is empty", () => {
    expect(squadMemberRoleLabel(false, "  ", "负责人", "添加角色…")).toBe(
      "添加角色…",
    );
  });
});

describe("SquadMemberRow", () => {
  it("renders leader and regular members with the same two-line structure", () => {
    const leader = flatten(
      SquadMemberRow({
        member: member(),
        name: "Mika",
        isLeader: true,
        roleLabel: "负责人",
        status: "idle",
        canManage: true,
        onPressRole: () => {},
      }),
    );
    const regular = flatten(
      SquadMemberRow({
        member: member({
          id: "member-row-2",
          member_id: "agent-2",
          role: "运维与发布",
        }),
        name: "服务运维",
        isLeader: false,
        roleLabel: "运维与发布",
        status: "working",
        canManage: true,
        onMenu: () => {},
        onPressRole: () => {},
      }),
    );
    const leaderText = leader.flatMap((element) =>
      textOf(element.props.children),
    );
    const regularText = regular.flatMap((element) =>
      textOf(element.props.children),
    );

    expect(leaderText).toContain("Mika");
    expect(leaderText).toContain("👑");
    expect(leaderText).toContain("负责人");
    expect(leaderText).toContain("status.idle");

    expect(regularText).toContain("服务运维");
    expect(regularText).toContain("运维与发布");
    expect(regularText).toContain("status.working");
    expect(
      regular.some((element) => element.type === "IconButton"),
    ).toBe(true);
  });

  it("reserves the menu slot for a leader without actions", () => {
    const elements = flatten(
      SquadMemberRow({
        member: member(),
        name: "Mika",
        isLeader: true,
        roleLabel: "负责人",
        status: "idle",
        canManage: true,
        onPressRole: () => {},
      }),
    );

    expect(elements.some((element) => element.type === "IconButton")).toBe(
      false,
    );
    expect(
      elements.some(
        (element) =>
          element.type === "View" &&
          element.props.className === "h-9 w-9",
      ),
    ).toBe(true);
  });
});
