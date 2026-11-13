// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentPresenceDetail } from "@multica/core/agents";
import type { Agent } from "@multica/core/types";
import {
  activeTaskCount,
  countArchived,
  effectiveAvailability,
  groupAgents,
  isArchivedAgent,
} from "./agent-list";

function agent(overrides: Partial<Agent> & Pick<Agent, "id">): Agent {
  const base: Agent = {
    id: "",
    workspace_id: "ws",
    runtime_id: "rt-1",
    name: "",
    description: "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "local",
    runtime_config: {},
    custom_args: [],
    visibility: "workspace",
    permission_mode: "public_to",
    invocation_targets: [],
    status: "offline",
    max_concurrent_tasks: 1,
    model: "",
    owner_id: null,
    skills: [],
    created_at: "",
    updated_at: "",
    archived_at: null,
    archived_by: null,
  };
  return { ...base, ...overrides };
}

function presence(
  availability: AgentPresenceDetail["availability"],
  runningCount = 0,
  queuedCount = 0,
): AgentPresenceDetail {
  return {
    availability,
    workload: runningCount > 0 ? "working" : queuedCount > 0 ? "queued" : "idle",
    runningCount,
    queuedCount,
    capacity: 1,
  };
}

describe("agent list grouping", () => {
  const agents = [
    agent({ id: "zed", name: "Zed", runtime_id: "rt-2" }),
    agent({ id: "alpha", name: "Alpha" }),
    agent({ id: "arch", name: "Archived", archived_at: "2026-11-01T00:00:00Z" }),
    agent({ id: "old", name: "Old", runtime_id: "rt-2" }),
  ];
  const presenceByAgent = new Map<string, AgentPresenceDetail>([
    ["zed", presence("online", 1)],
    ["alpha", presence("offline")],
    ["arch", presence("online")],
    ["old", presence("unstable", 0, 2)],
  ]);

  it("orders active, offline, archived and hides archived by default", () => {
    const sections = groupAgents(agents, presenceByAgent, {
      query: "",
      runtimeId: null,
      showArchived: false,
    });
    expect(sections.map((section) => section.key)).toEqual([
      "active",
      "offline",
    ]);
    expect(sections[0].agents.map((a) => a.id)).toEqual(["old", "zed"]);
    expect(sections[1].agents.map((a) => a.id)).toEqual(["alpha"]);
  });

  it("shows archived last when enabled", () => {
    const sections = groupAgents(agents, presenceByAgent, {
      query: "",
      runtimeId: null,
      showArchived: true,
    });
    expect(sections.map((section) => section.key)).toEqual([
      "active",
      "offline",
      "archived",
    ]);
    expect(sections[2].agents.map((a) => a.id)).toEqual(["arch"]);
  });

  it("filters by name/description and runtime", () => {
    const withDescription = [
      ...agents,
      agent({ id: "desc", name: "Other", description: "Alpha helper" }),
    ];
    expect(
      groupAgents(withDescription, presenceByAgent, {
        query: "alpha",
        runtimeId: null,
        showArchived: true,
      })
        .flatMap((section) => section.agents)
        .map((a) => a.id)
        .sort(),
    ).toEqual(["alpha", "desc"]);

    expect(
      groupAgents(agents, presenceByAgent, {
        query: "",
        runtimeId: "rt-2",
        showArchived: true,
      })
        .flatMap((section) => section.agents)
        .map((a) => a.id)
        .sort(),
    ).toEqual(["old", "zed"]);
  });

  it("archived wins over a stale online presence", () => {
    expect(isArchivedAgent(agents[2], presence("online"))).toBe(true);
    expect(countArchived(agents, presenceByAgent)).toBe(1);
  });

  it("falls back to the server projection before presence loads", () => {
    expect(
      effectiveAvailability(
        agent({ id: "cold", runtime_availability: "online" }),
        undefined,
      ),
    ).toBe("online");
    expect(effectiveAvailability(agent({ id: "cold" }), undefined)).toBe(
      "offline",
    );
    expect(
      effectiveAvailability(agents[2], presence("online")),
    ).toBe("archived");
  });

  it("counts running plus queued tasks as active", () => {
    expect(activeTaskCount(presence("online", 2, 3))).toBe(5);
    expect(activeTaskCount(undefined)).toBe(0);
  });
});
