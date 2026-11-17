import { describe, expect, it } from "vitest";
import type { Label } from "@multica/core/types";
import { diffAgentLabels, toggleAgentLabel } from "./agent-labels";

function label(id: string): Label {
  return {
    id,
    workspace_id: "ws-1",
    resource_type: "agent",
    name: id,
    color: "#3b82f6",
    created_at: "",
    updated_at: "",
  };
}

describe("diffAgentLabels", () => {
  it("returns nothing when the selection is unchanged", () => {
    const current = [label("a"), label("b")];
    expect(diffAgentLabels(current, [label("b"), label("a")])).toEqual({
      attach: [],
      detach: [],
    });
  });

  it("splits additions and removals", () => {
    const diff = diffAgentLabels(
      [label("a"), label("b")],
      [label("b"), label("c")],
    );
    expect(diff.attach.map((item) => item.id)).toEqual(["c"]);
    expect(diff.detach.map((item) => item.id)).toEqual(["a"]);
  });

  it("collapses duplicate ids to one request per label", () => {
    const diff = diffAgentLabels([], [label("a"), label("a")]);
    expect(diff.attach).toHaveLength(1);
  });

  it("detaches everything when the selection is cleared", () => {
    const diff = diffAgentLabels([label("a"), label("b")], []);
    expect(diff.attach).toEqual([]);
    expect(diff.detach.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("toggleAgentLabel", () => {
  it("adds and removes by id", () => {
    const a = label("a");
    const b = label("b");
    expect(toggleAgentLabel([a], b).map((item) => item.id)).toEqual(["a", "b"]);
    expect(toggleAgentLabel([a, b], a).map((item) => item.id)).toEqual(["b"]);
  });
});
