// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "@/lib/parse-response";
import {
  EMPTY_SQUAD,
  SquadListSchema,
  SquadMemberListSchema,
  SquadMemberStatusListSchema,
  SquadSchema,
} from "./schemas";

describe("SquadSchema", () => {
  it("defaults member_count and member_preview when an older backend omits them", () => {
    const parsed = SquadSchema.parse({
      id: "s1",
      workspace_id: "ws",
      name: "Guild",
      leader_id: "a1",
      creator_id: "u1",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    expect(parsed.member_count).toBe(0);
    expect(parsed.member_preview).toEqual([]);
  });

  it("parses the member preview carried by list/detail responses", () => {
    const parsed = SquadSchema.parse({
      id: "s1",
      workspace_id: "ws",
      name: "Guild",
      leader_id: "a1",
      creator_id: "u1",
      created_at: "",
      updated_at: "",
      member_count: 4,
      member_preview: [
        { member_type: "agent", member_id: "a1", role: "lead" },
        { member_type: "member", member_id: "u1", role: "" },
      ],
    });

    expect(parsed.member_count).toBe(4);
    expect(parsed.member_preview).toEqual([
      { member_type: "agent", member_id: "a1", role: "lead" },
      { member_type: "member", member_id: "u1", role: "" },
    ]);
  });

  it("fails a payload without an id so parseWithFallback can flag drift", () => {
    expect(SquadSchema.safeParse({ name: "Guild" }).success).toBe(false);
    expect(
      parseWithFallback(
        [{ name: "Guild" }],
        SquadListSchema,
        [],
        { endpoint: "test" },
      ),
    ).toEqual([]);
    expect(EMPTY_SQUAD.id).toBe("");
  });
});

describe("squad member schemas", () => {
  it("parses a roster with defaults", () => {
    expect(
      SquadMemberListSchema.parse([
        { id: "sm1", member_type: "agent", member_id: "a1" },
      ]),
    ).toEqual([
      {
        id: "sm1",
        squad_id: "",
        member_type: "agent",
        member_id: "a1",
        role: "",
        created_at: "",
      },
    ]);
  });

  it("defaults missing active issues and unknown status values stay strings", () => {
    const parsed = SquadMemberStatusListSchema.parse({
      members: [
        { member_type: "agent", member_id: "a1", status: "paused" },
        { member_type: "member", member_id: "u1", status: null },
      ],
    });

    expect(parsed.members[0]).toEqual({
      member_type: "agent",
      member_id: "a1",
      status: "paused",
      active_issues: [],
      last_active_at: null,
    });
    expect(parsed.members[1].active_issues).toEqual([]);
  });
});
