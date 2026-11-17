import { describe, expect, it } from "vitest";
import type { Agent, Issue } from "@multica/core/types";
import {
  agentAssignmentNeedsRunConfirm,
  batchWriteOutcome,
  canDeleteIssueSelection,
  retainVisibleSelection,
  selectAllVisible,
  toggleSelection,
} from "./issue-batch";

function issue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    workspace_id: "ws-1",
    number: 1,
    identifier: `MUL-${id}`,
    title: id,
    description: null,
    status: "todo",
    priority: "none",
    assignee_type: null,
    assignee_id: null,
    creator_type: "member",
    creator_id: "user-1",
    parent_issue_id: null,
    project_id: null,
    position: 0,
    stage: null,
    start_date: null,
    due_date: null,
    metadata: {},
    properties: {},
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("selection helpers", () => {
  it("keeps only ids still present in the visible list", () => {
    expect(retainVisibleSelection(["a", "b", "c"], ["c", "a"])).toEqual([
      "a",
      "c",
    ]);
  });

  it("toggles ids without duplicating them", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelection(["a", "b"], "a")).toEqual(["b"]);
  });

  it("selects every loaded visible row once", () => {
    expect(selectAllVisible(["a", "b", "a"])).toEqual(["a", "b"]);
  });

  it("reports a partial result whenever the server updated fewer rows", () => {
    expect(batchWriteOutcome(3, 3)).toBe("success");
    expect(batchWriteOutcome(2, 3)).toBe("partial");
  });
});

describe("batch assignment and deletion guards", () => {
  it("requires confirmation for agent/squad assignment outside Backlog", () => {
    const parked = [issue("a", { status: "backlog" })];
    expect(agentAssignmentNeedsRunConfirm("agent", parked, 1)).toBe(false);
    expect(
      agentAssignmentNeedsRunConfirm(
        "squad",
        [issue("a", { status: "todo" })],
        1,
      ),
    ).toBe(true);
    expect(agentAssignmentNeedsRunConfirm("member", parked, 1)).toBe(false);
  });

  it("confirms conservatively when a selected issue is missing from cache", () => {
    expect(
      agentAssignmentNeedsRunConfirm(
        "agent",
        [issue("a", { status: "backlog" })],
        2,
      ),
    ).toBe(true);
  });

  it("enables deletion only when every selected issue is deletable", () => {
    const agents: Agent[] = [
      {
        id: "agent-1",
        owner_id: "user-1",
      } as Agent,
    ];
    const mine = issue("a", {
      creator_type: "member",
      creator_id: "user-1",
    });
    const theirs = issue("b", {
      creator_type: "member",
      creator_id: "user-2",
    });
    expect(canDeleteIssueSelection([mine], "user-1", "member", agents, 1)).toBe(
      true,
    );
    expect(
      canDeleteIssueSelection([mine, theirs], "user-1", "member", agents, 2),
    ).toBe(false);
    expect(canDeleteIssueSelection([theirs], "user-1", "admin", agents, 1)).toBe(
      true,
    );
    expect(canDeleteIssueSelection([mine], "user-1", "member", agents, 2)).toBe(
      false,
    );
  });

});
