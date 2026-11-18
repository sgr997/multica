// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentPresenceDetail } from "@multica/core/agents";
import type { Agent, AgentTask } from "@multica/core/types";
import {
  activeTaskCount,
  agentRuntimeParts,
  collectAttention,
  countArchived,
  effectiveAvailability,
  groupAgents,
  isArchivedAgent,
  needsAttention,
  summarizeAgents,
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

function task(id: string, agentId: string, status = "queued"): AgentTask {
  return {
    id,
    agent_id: agentId,
    issue_id: `issue-${id}`,
    status,
  } as AgentTask;
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

  it("orders working, available, offline, archived and hides archived by default", () => {
    const sections = groupAgents(agents, presenceByAgent, {
      query: "",
      runtimeId: null,
      showArchived: false,
    });
    expect(sections.map((section) => section.key)).toEqual([
      "working",
      "available",
      "offline",
    ]);
    expect(sections[0].agents.map((a) => a.id)).toEqual(["zed"]);
    expect(sections[1].agents.map((a) => a.id)).toEqual(["old"]);
    expect(sections[2].agents.map((a) => a.id)).toEqual(["alpha"]);
  });

  it("shows archived last when enabled", () => {
    const sections = groupAgents(agents, presenceByAgent, {
      query: "",
      runtimeId: null,
      showArchived: true,
    });
    expect(sections.map((section) => section.key)).toEqual([
      "working",
      "available",
      "offline",
      "archived",
    ]);
    expect(sections[3].agents.map((a) => a.id)).toEqual(["arch"]);
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

describe("needs-attention rule", () => {
  const idle = agent({ id: "idle", name: "Idle" });

  it("flags queued work on an unreachable runtime only", () => {
    expect(needsAttention(idle, presence("offline", 0, 2))).toBe(true);
    expect(needsAttention(idle, presence("unstable", 0, 1))).toBe(true);
    expect(needsAttention(idle, presence("online", 0, 2))).toBe(false);
    expect(needsAttention(idle, presence("offline", 0, 0))).toBe(false);
    expect(needsAttention(idle, undefined)).toBe(false);
  });

  it("never flags an archived agent with stale queued presence", () => {
    expect(
      needsAttention(
        agent({ id: "arch", name: "Arch", archived_at: "2026-11-01T00:00:00Z" }),
        presence("offline", 0, 3),
      ),
    ).toBe(false);
  });
});

describe("summary counts", () => {
  const agents = [
    agent({ id: "run", name: "Run" }),
    agent({ id: "idle", name: "Idle" }),
    agent({ id: "off", name: "Off" }),
    agent({ id: "arch", name: "Arch", archived_at: "2026-11-01T00:00:00Z" }),
  ];
  const presenceByAgent = new Map<string, AgentPresenceDetail>([
    ["run", presence("online", 2, 1)],
    ["idle", presence("online")],
    ["off", presence("offline", 0, 2)],
    ["arch", presence("online")],
  ]);

  it("counts live, working and attention without archived rows", () => {
    expect(summarizeAgents(agents, presenceByAgent)).toEqual({
      live: 2,
      working: 1,
      attention: 1,
    });
  });
});

describe("attention entries", () => {
  const agents = [
    agent({ id: "a1", name: "Alpha" }),
    agent({ id: "a2", name: "Beta" }),
  ];
  const presenceByAgent = new Map<string, AgentPresenceDetail>([
    ["a1", presence("offline", 0, 2)],
    ["a2", presence("offline", 0, 3)],
  ]);

  it("groups queued tasks per agent, largest backlog first", () => {
    const entries = collectAttention(
      agents,
      [task("t1", "a1"), task("t2", "a1", "running"), task("t3", "a2")],
      presenceByAgent,
    );
    expect(entries.map((entry) => entry.agent.id)).toEqual(["a2", "a1"]);
    expect(entries[0].count).toBe(3);
    expect(entries[1].tasks.map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("runtime parts", () => {
  it("capitalizes the provider and prefers the custom machine name", () => {
    expect(
      agentRuntimeParts({
        provider: "codex",
        name: "PeiMac-mini.local",
        custom_name: "Build box",
      }),
    ).toEqual({ provider: "Codex", machine: "Build box" });
  });

  it("falls back to the runtime name and survives a missing runtime", () => {
    expect(
      agentRuntimeParts({ provider: "claude", name: "Studio" }),
    ).toEqual({ provider: "Claude", machine: "Studio" });
    expect(agentRuntimeParts(null)).toEqual({ provider: "", machine: "" });
  });
});
