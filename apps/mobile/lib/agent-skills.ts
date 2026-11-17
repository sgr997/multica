import type {
  AgentSkillSummary,
  DisabledRuntimeSkill,
  RuntimeLocalSkillSummary,
  SkillSummary,
} from "@multica/core/types";

/** Replace one skill's enabled flag, preserving order. */
export function withSkillEnabled(
  skills: AgentSkillSummary[],
  skillId: string,
  enabled: boolean,
): AgentSkillSummary[] {
  return skills.map((skill) =>
    skill.id === skillId ? { ...skill, enabled } : skill,
  );
}

export function withoutSkill(
  skills: AgentSkillSummary[],
  skillId: string,
): AgentSkillSummary[] {
  return skills.filter((skill) => skill.id !== skillId);
}

/**
 * Append newly attached skills. The POST /skills/add response is
 * authoritative, but the optimistic patch runs before it; dedupe so a
 * double-submit can never render the same skill twice.
 */
export function mergeAgentSkills(
  existing: AgentSkillSummary[],
  added: SkillSummary[],
): AgentSkillSummary[] {
  const seen = new Set(existing.map((skill) => skill.id));
  const merged = [...existing];
  for (const skill of added) {
    if (seen.has(skill.id)) continue;
    seen.add(skill.id);
    merged.push({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      enabled: true,
    });
  }
  return merged;
}

/** Narrow the workspace-library row to the shape embedded in an Agent. */
export function toAgentSkillSummaries(
  skills: SkillSummary[],
): AgentSkillSummary[] {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    enabled: skill.enabled !== false,
  }));
}

export function toggleSelectedSkill(
  selected: ReadonlySet<string>,
  skillId: string,
): Set<string> {
  const next = new Set(selected);
  if (next.has(skillId)) next.delete(skillId);
  else next.add(skillId);
  return next;
}

/** Case-insensitive name/description filter over the workspace library. */
export function filterSkillLibrary(
  skills: SkillSummary[],
  query: string,
): SkillSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return skills;
  return skills.filter((skill) =>
    `${skill.name} ${skill.description}`.toLowerCase().includes(needle),
  );
}

/**
 * Cap a long library before it reaches the sheet. The add sheet grows the
 * window by `SKILL_PAGE_SIZE` on demand instead of mounting hundreds of rows
 * at once.
 */
export const SKILL_PAGE_SIZE = 50;

export function skillPage(
  skills: SkillSummary[],
  limit: number,
): { visible: SkillSummary[]; hasMore: boolean } {
  return {
    visible: skills.slice(0, limit),
    hasMore: skills.length > limit,
  };
}

export function runtimeSkillRowKey(skill: RuntimeLocalSkillSummary): string {
  return `${skill.root ?? "unknown"}:${skill.key}:${skill.plugin ?? ""}`;
}

/**
 * Match the server's identity: runtime + provider + root + key + plugin.
 * A same-named skill on another runtime (or another discovery root) is a
 * different skill.
 */
export function isRuntimeSkillDisabled(
  disabledSkills: DisabledRuntimeSkill[] | undefined,
  runtimeId: string | null,
  skill: RuntimeLocalSkillSummary,
): boolean {
  if (!runtimeId || !skill.root) return false;
  return (disabledSkills ?? []).some(
    (disabled) =>
      disabled.runtime_id === runtimeId &&
      disabled.provider === skill.provider &&
      disabled.root === skill.root &&
      disabled.key === skill.key &&
      (disabled.plugin ?? "") === (skill.plugin ?? ""),
  );
}

/**
 * Return the disabled list after toggling one runtime skill: enabling drops
 * the override, disabling appends it (replacing any stale duplicate).
 */
export function withRuntimeSkillEnabled(
  disabledSkills: DisabledRuntimeSkill[] | undefined,
  runtimeId: string,
  skill: RuntimeLocalSkillSummary,
  enabled: boolean,
): DisabledRuntimeSkill[] {
  const current = disabledSkills ?? [];
  if (!skill.root) return current;
  const matches = (entry: DisabledRuntimeSkill) =>
    entry.runtime_id === runtimeId &&
    entry.provider === skill.provider &&
    entry.root === skill.root &&
    entry.key === skill.key &&
    (entry.plugin ?? "") === (skill.plugin ?? "");
  const next = current.filter((entry) => !matches(entry));
  if (enabled) return next;
  next.push({
    runtime_id: runtimeId,
    provider: skill.provider,
    root: skill.root,
    key: skill.key,
    name: skill.name,
    ...(skill.plugin ? { plugin: skill.plugin } : {}),
  });
  return next;
}
