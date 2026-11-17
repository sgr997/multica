import type { Label } from "@multica/core/types";

/**
 * Difference between the labels an agent currently has and the labels the
 * editor has selected. The backend exposes attach/detach endpoints rather
 * than a wholesale replace, so the save path has to be a diff.
 */
export interface AgentLabelDiff {
  attach: Label[];
  detach: Label[];
}

function dedupeById(labels: readonly Label[]): Label[] {
  const seen = new Set<string>();
  const result: Label[] = [];
  for (const label of labels) {
    if (seen.has(label.id)) continue;
    seen.add(label.id);
    result.push(label);
  }
  return result;
}

/**
 * Pure diff used by the label sheet and its mutation. Duplicate selections
 * collapse to one request per label so a rapid double tap cannot attach the
 * same label twice.
 */
export function diffAgentLabels(
  current: readonly Label[],
  next: readonly Label[],
): AgentLabelDiff {
  const currentIds = new Set(current.map((label) => label.id));
  const nextIds = new Set(next.map((label) => label.id));

  return {
    attach: dedupeById(next.filter((label) => !currentIds.has(label.id))),
    detach: dedupeById(current.filter((label) => !nextIds.has(label.id))),
  };
}

/** Toggle one label in the editor's draft selection. */
export function toggleAgentLabel(
  selected: readonly Label[],
  label: Label,
): Label[] {
  return selected.some((item) => item.id === label.id)
    ? selected.filter((item) => item.id !== label.id)
    : [...selected, label];
}
