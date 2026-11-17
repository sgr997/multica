import { describe, expect, it } from "vitest";
import type {
  AgentSkillSummary,
  DisabledRuntimeSkill,
  RuntimeLocalSkillSummary,
  SkillSummary,
} from "@multica/core/types";
import {
  filterSkillLibrary,
  isRuntimeSkillDisabled,
  mergeAgentSkills,
  skillPage,
  toAgentSkillSummaries,
  toggleSelectedSkill,
  withRuntimeSkillEnabled,
  withSkillEnabled,
  withoutSkill,
} from "./agent-skills";

const attached: AgentSkillSummary[] = [
  { id: "a", name: "Alpha", description: "first", enabled: true },
  { id: "b", name: "Beta", description: "second", enabled: false },
];

function librarySkill(id: string, name: string): SkillSummary {
  return {
    id,
    workspace_id: "ws-1",
    name,
    description: `${name} description`,
    config: {},
    created_by: null,
    created_at: "",
    updated_at: "",
  };
}

describe("agent skill list transforms", () => {
  it("toggles one skill without touching order", () => {
    expect(withSkillEnabled(attached, "b", true)).toEqual([
      { id: "a", name: "Alpha", description: "first", enabled: true },
      { id: "b", name: "Beta", description: "second", enabled: true },
    ]);
  });

  it("removes only the requested skill", () => {
    expect(withoutSkill(attached, "a").map((skill) => skill.id)).toEqual(["b"]);
  });

  it("merges added skills, deduping an already-attached id", () => {
    const merged = mergeAgentSkills(attached, [
      librarySkill("b", "Beta"),
      librarySkill("c", "Gamma"),
    ]);
    expect(merged.map((skill) => skill.id)).toEqual(["a", "b", "c"]);
    expect(merged[2]).toEqual({
      id: "c",
      name: "Gamma",
      description: "Gamma description",
      enabled: true,
    });
  });

  it("narrows write responses to the embedded agent shape", () => {
    expect(
      toAgentSkillSummaries([
        { ...librarySkill("a", "Alpha"), enabled: false },
      ]),
    ).toEqual([
      { id: "a", name: "Alpha", description: "Alpha description", enabled: false },
    ]);
  });
});

describe("add-skill selection", () => {
  it("toggles ids in and out of the set", () => {
    const once = toggleSelectedSkill(new Set<string>(), "a");
    expect([...once]).toEqual(["a"]);
    expect([...toggleSelectedSkill(once, "a")]).toEqual([]);
  });

  it("filters by name or description, case-insensitively", () => {
    const skills = [
      librarySkill("a", "Deploy"),
      librarySkill("b", "Analyze"),
    ];
    expect(filterSkillLibrary(skills, " depl ").map((s) => s.id)).toEqual(["a"]);
    expect(
      filterSkillLibrary(skills, "analyze description").map((s) => s.id),
    ).toEqual(["b"]);
    expect(filterSkillLibrary(skills, "  ")).toHaveLength(2);
  });

  it("pages a long library and reports whether more remain", () => {
    const skills = Array.from({ length: 120 }, (_, index) =>
      librarySkill(`skill-${index}`, `Skill ${index}`),
    );
    expect(skillPage(skills, 50).visible).toHaveLength(50);
    expect(skillPage(skills, 50).hasMore).toBe(true);
    expect(skillPage(skills, 120)).toMatchObject({ hasMore: false });
  });
});

const runtimeSkill: RuntimeLocalSkillSummary = {
  key: "release",
  name: "Release",
  source_path: "/Users/me/.claude/skills/release",
  provider: "claude",
  root: "provider",
  file_count: 2,
};

describe("runtime skill overrides", () => {
  it("matches on runtime, provider, root, key and plugin", () => {
    const disabled: DisabledRuntimeSkill[] = [
      {
        runtime_id: "rt-1",
        provider: "claude",
        root: "provider",
        key: "release",
      },
    ];
    expect(isRuntimeSkillDisabled(disabled, "rt-1", runtimeSkill)).toBe(true);
    expect(isRuntimeSkillDisabled(disabled, "rt-2", runtimeSkill)).toBe(false);
    expect(
      isRuntimeSkillDisabled(disabled, "rt-1", {
        ...runtimeSkill,
        root: "universal",
      }),
    ).toBe(false);
  });

  it("appends on disable and drops the override on enable", () => {
    const disabled = withRuntimeSkillEnabled([], "rt-1", runtimeSkill, false);
    expect(disabled).toEqual([
      {
        runtime_id: "rt-1",
        provider: "claude",
        root: "provider",
        key: "release",
        name: "Release",
      },
    ]);
    expect(
      withRuntimeSkillEnabled(disabled, "rt-1", runtimeSkill, true),
    ).toEqual([]);
  });

  it("ignores skills without a discovery root", () => {
    const rootless = { ...runtimeSkill, root: undefined };
    expect(withRuntimeSkillEnabled([], "rt-1", rootless, false)).toEqual([]);
    expect(isRuntimeSkillDisabled([], "rt-1", rootless)).toBe(false);
  });
});
