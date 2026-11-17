// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  AgentSchema,
  AgentSkillsResponseSchema,
  RuntimeLocalSkillListRequestSchema,
  SkillSearchCandidateListSchema,
  SkillSummarySchema,
} from "./schemas";

describe("SkillSummarySchema", () => {
  it("keeps the fields the picker and the agent row need", () => {
    const skill = SkillSummarySchema.parse({
      id: "skill-1",
      workspace_id: "ws-1",
      name: "Deploy",
      description: "Ship the app",
      config: { origin: "https://example.test/deploy" },
      created_by: "user-1",
      created_at: "2026-11-13T00:00:00Z",
      updated_at: "2026-11-13T00:00:00Z",
      labels: [{ id: "label-1", name: "ops" }],
      future_field: "kept",
    });

    expect(skill.name).toBe("Deploy");
    expect(skill.description).toBe("Ship the app");
    expect(skill.config).toEqual({ origin: "https://example.test/deploy" });
    expect(skill.labels).toEqual([{ id: "label-1", name: "ops" }]);
    expect((skill as unknown as { future_field?: string }).future_field).toBe(
      "kept",
    );
  });

  it("defaults missing summary fields but still requires an id", () => {
    expect(SkillSummarySchema.parse({ id: "skill-1" })).toMatchObject({
      id: "skill-1",
      name: "",
      description: "",
      config: {},
      created_by: null,
    });
    expect(() => SkillSummarySchema.parse({ name: "no id" })).toThrow();
  });
});

describe("AgentSkillsResponseSchema", () => {
  it("parses the write response with enabled flags", () => {
    expect(
      AgentSkillsResponseSchema.parse([
        { id: "skill-1", name: "Deploy", description: "Ship", enabled: false },
      ]),
    ).toEqual([
      {
        id: "skill-1",
        workspace_id: "",
        name: "Deploy",
        description: "Ship",
        config: {},
        created_by: null,
        created_at: "",
        updated_at: "",
        enabled: false,
        labels: [],
      },
    ]);
  });

  it("fails a malformed write response instead of reading it as empty", () => {
    expect(() => AgentSkillsResponseSchema.parse({ skills: [] })).toThrow();
  });
});

describe("AgentSchema skills", () => {
  it("parses attached skills and runtime disable overrides", () => {
    const agent = AgentSchema.parse({
      id: "agent-1",
      skills: [
        { id: "skill-1", name: "Deploy", description: "Ship", enabled: false },
      ],
      disabled_runtime_skills: [
        {
          runtime_id: "rt-1",
          provider: "claude",
          root: "provider",
          key: "release",
          name: "Release",
        },
      ],
    });

    expect(agent.skills).toEqual([
      { id: "skill-1", name: "Deploy", description: "Ship", enabled: false },
    ]);
    expect(agent.disabled_runtime_skills).toEqual([
      {
        runtime_id: "rt-1",
        provider: "claude",
        root: "provider",
        key: "release",
        name: "Release",
      },
    ]);
  });

  it("defaults the runtime override list when the server omits it", () => {
    expect(AgentSchema.parse({ id: "agent-1" }).disabled_runtime_skills).toEqual(
      [],
    );
  });
});

describe("runtime skill discovery schema", () => {
  it("parses a completed discovery request with skills", () => {
    const request = RuntimeLocalSkillListRequestSchema.parse({
      id: "req-1",
      runtime_id: "rt-1",
      status: "completed",
      supported: true,
      skills: [
        {
          key: "release",
          name: "Release",
          description: "Cut a release",
          source_path: "/Users/me/.claude/skills/release",
          provider: "claude",
          root: "provider",
          can_disable: true,
          file_count: 3,
        },
      ],
    });

    expect(request.status).toBe("completed");
    expect(request.supported).toBe(true);
    expect(request.skills?.[0]).toMatchObject({
      key: "release",
      root: "provider",
      can_disable: true,
    });
  });

  it("treats an unknown status as failed and defaults the skill list", () => {
    const request = RuntimeLocalSkillListRequestSchema.parse({
      id: "req-1",
      status: "weird",
    });
    expect(request.status).toBe("failed");
    expect(request.skills).toEqual([]);
    expect(request.supported).toBe(false);
  });
});

describe("SkillSearchCandidateListSchema", () => {
  it("parses marketplace candidates without workspace ids", () => {
    const candidates = SkillSearchCandidateListSchema.parse([
      {
        name: "pdf",
        url: "https://clawhub.test/pdf",
        source: "clawhub",
        repo: null,
        install_count: 12,
        github_stars: null,
        description: "PDF tools",
      },
    ]);
    expect(candidates[0]?.name).toBe("pdf");
    expect(candidates[0]?.install_count).toBe(12);
  });
});
