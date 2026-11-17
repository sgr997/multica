// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AgentPresenceDetail } from "@multica/core/agents";
import type { Squad, SquadMember } from "@multica/core/types";
import {
  canManageSquad,
  diffSquadMembers,
  filterSquads,
  summarizeSquadStatus,
} from "./squads";

function squad(id: string, name: string, patch: Partial<Squad> = {}): Squad {
  return {
    id,
    workspace_id: "ws",
    name,
    description: "",
    instructions: "",
    avatar_url: null,
    leader_id: `leader-${id}`,
    creator_id: `creator-${id}`,
    created_at: "",
    updated_at: "",
    archived_at: null,
    archived_by: null,
    member_count: 0,
    member_preview: [],
    ...patch,
  };
}

function member(
  type: "agent" | "member",
  id: string,
): SquadMember {
  return {
    id: `${type}-${id}`,
    squad_id: "s1",
    member_type: type,
    member_id: id,
    role: "",
    created_at: "",
  };
}

function presence(
  patch: Partial<AgentPresenceDetail>,
): AgentPresenceDetail {
  return {
    availability: "offline",
    workload: "idle",
    runningCount: 0,
    queuedCount: 0,
    capacity: 1,
    ...patch,
  };
}

describe("filterSquads", () => {
  const squads = [
    squad("a", "Frontend Guild"),
    squad("b", "Backend Guild"),
    squad("c", "Design"),
  ];

  it("keeps every squad in the all scope", () => {
    expect(
      filterSquads(squads, {
        query: "",
        scope: "all",
        involvedIds: new Set(),
      }).map((item) => item.id),
    ).toEqual(["a", "b", "c"]);
  });

  it("filters the mine scope by involved ids", () => {
    expect(
      filterSquads(squads, {
        query: "",
        scope: "mine",
        involvedIds: new Set(["b", "c"]),
      }).map((item) => item.id),
    ).toEqual(["b", "c"]);
  });

  it("matches names case-insensitively after trimming", () => {
    expect(
      filterSquads(squads, {
        query: "  GUILD ",
        scope: "all",
        involvedIds: new Set(),
      }).map((item) => item.id),
    ).toEqual(["a", "b"]);
  });

  it("combines scope and search", () => {
    expect(
      filterSquads(squads, {
        query: "design",
        scope: "mine",
        involvedIds: new Set(["a", "b"]),
      }),
    ).toEqual([]);
  });
});

describe("canManageSquad", () => {
  const target = squad("s1", "Guild", { creator_id: "creator-1" });

  it("allows workspace owners and admins", () => {
    expect(canManageSquad(target, "u1", "owner")).toBe(true);
    expect(canManageSquad(target, "u1", "admin")).toBe(true);
  });

  it("allows the creator", () => {
    expect(canManageSquad(target, "creator-1", "member")).toBe(true);
  });

  it("rejects other regular members", () => {
    expect(canManageSquad(target, "u2", "member")).toBe(false);
    expect(canManageSquad(target, null, "member")).toBe(false);
  });
});

describe("diffSquadMembers", () => {
  it("returns only members that were added", () => {
    const existing = [
      { member_type: "agent" as const, member_id: "a1" },
      { member_type: "member" as const, member_id: "u1" },
    ];
    const selected = [
      { member_type: "agent" as const, member_id: "a1" },
      { member_type: "agent" as const, member_id: "a2" },
      { member_type: "member" as const, member_id: "u1" },
    ];

    expect(diffSquadMembers(existing, selected)).toEqual({
      toAdd: [{ member_type: "agent", member_id: "a2" }],
      toRemove: [],
    });
  });

  it("computes removals for a full selection diff", () => {
    const existing = [
      { member_type: "agent" as const, member_id: "a1" },
      { member_type: "member" as const, member_id: "u1" },
    ];
    const selected = [{ member_type: "member" as const, member_id: "u1" }];

    expect(diffSquadMembers(existing, selected)).toEqual({
      toAdd: [],
      toRemove: [{ member_type: "agent", member_id: "a1" }],
    });
  });

  it("treats the same id under different member types as distinct", () => {
    expect(
      diffSquadMembers(
        [{ member_type: "agent", member_id: "same" }],
        [{ member_type: "member", member_id: "same" }],
      ),
    ).toEqual({
      toAdd: [{ member_type: "member", member_id: "same" }],
      toRemove: [{ member_type: "agent", member_id: "same" }],
    });
  });
});

describe("summarizeSquadStatus", () => {
  it("prefers working over runtime health", () => {
    expect(
      summarizeSquadStatus(
        presence({ availability: "offline", workload: "working" }),
      ),
    ).toBe("working");
    expect(
      summarizeSquadStatus(
        presence({ availability: "offline", runningCount: 1 }),
      ),
    ).toBe("working");
  });

  it("maps online to idle and unstable to unstable", () => {
    expect(
      summarizeSquadStatus(presence({ availability: "online" })),
    ).toBe("idle");
    expect(
      summarizeSquadStatus(presence({ availability: "unstable" })),
    ).toBe("unstable");
  });

  it("falls back to offline with no presence", () => {
    expect(summarizeSquadStatus(undefined)).toBe("offline");
  });
});

describe("member fixtures", () => {
  it("keeps the helper shape aligned with the API", () => {
    expect(member("agent", "a1").member_type).toBe("agent");
  });
});
