import {
  AGENT_MAX_CONCURRENT_TASKS_MAX,
  AGENT_MAX_CONCURRENT_TASKS_MIN,
} from "@multica/core/agents/constants";
import type { UpdateAgentRequest } from "@multica/core/types";

export interface AgentRuntimeConfigDraft {
  customArgs: string[];
  maxConcurrentTasks: number;
}

export type AgentRuntimeConfigError =
  | { kind: "empty_arg" }
  | { kind: "concurrency_range" };

/** Trim each argument and drop blanks, matching web's `entriesToArgs`. */
export function normalizeCustomArgs(args: readonly string[]): string[] {
  return args.map((arg) => arg.trim()).filter(Boolean);
}

/**
 * Local sanity checks only. Managed-flag and provider-specific rejections
 * belong to the server's `ValidateCustomArgs`; the UI surfaces that error
 * verbatim instead of duplicating the blocklist here.
 */
export function validateRuntimeConfigDraft(
  draft: AgentRuntimeConfigDraft,
): AgentRuntimeConfigError | null {
  if (draft.customArgs.some((arg) => !arg.trim())) {
    return { kind: "empty_arg" };
  }
  const concurrency = draft.maxConcurrentTasks;
  if (
    !Number.isInteger(concurrency) ||
    concurrency < AGENT_MAX_CONCURRENT_TASKS_MIN ||
    concurrency > AGENT_MAX_CONCURRENT_TASKS_MAX
  ) {
    return { kind: "concurrency_range" };
  }
  return null;
}

/** The two fields this mobile block owns on `PUT /api/agents/{id}`. */
export function buildRuntimeConfigPatch(
  draft: AgentRuntimeConfigDraft,
): Pick<UpdateAgentRequest, "custom_args" | "max_concurrent_tasks"> {
  return {
    custom_args: normalizeCustomArgs(draft.customArgs),
    max_concurrent_tasks: draft.maxConcurrentTasks,
  };
}

export function clampConcurrency(value: number): number {
  if (!Number.isFinite(value)) return AGENT_MAX_CONCURRENT_TASKS_MIN;
  return Math.min(
    AGENT_MAX_CONCURRENT_TASKS_MAX,
    Math.max(AGENT_MAX_CONCURRENT_TASKS_MIN, Math.round(value)),
  );
}
