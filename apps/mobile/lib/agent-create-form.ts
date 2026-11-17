import type { CreateAgentRequest, RuntimeDevice } from "@multica/core/types";
import { canBindRuntime } from "@/lib/runtime-access";

export interface AgentCreateDraft {
  name: string;
  description: string;
  instructions: string;
  avatarUrl: string | null;
}

export type AgentCreateFieldError = "required" | "missing" | "offline" | "forbidden";

export interface AgentCreateValidation {
  name: AgentCreateFieldError | null;
  runtime: AgentCreateFieldError | null;
}

/**
 * A runtime is selectable only when this member may bind it AND it is online.
 * Offline bindable runtimes are still listed (with an Offline label) so the
 * empty state can distinguish "nothing you can use" from "your machine is
 * asleep" — the same distinction web's runtime picker draws.
 */
export function isRuntimeSelectable(
  runtime: RuntimeDevice | null,
  currentUserId: string | null,
): boolean {
  return !!runtime && runtime.status === "online" && canBindRuntime(runtime, currentUserId);
}

export function validateAgentCreateForm(
  draft: Pick<AgentCreateDraft, "name">,
  runtime: RuntimeDevice | null,
  currentUserId: string | null,
): AgentCreateValidation {
  return {
    name: draft.name.trim().length > 0 ? null : "required",
    runtime: !runtime
      ? "missing"
      : !canBindRuntime(runtime, currentUserId)
        ? "forbidden"
        : runtime.status !== "online"
          ? "offline"
          : null,
  };
}

export function isAgentCreateReady(
  draft: Pick<AgentCreateDraft, "name">,
  runtime: RuntimeDevice | null,
  currentUserId: string | null,
): boolean {
  const validation = validateAgentCreateForm(draft, runtime, currentUserId);
  return validation.name === null && validation.runtime === null;
}

export function isAgentCreateDraftDirty(
  draft: AgentCreateDraft,
  runtimeId: string | null,
): boolean {
  return (
    draft.name.length > 0 ||
    draft.description.length > 0 ||
    draft.instructions.length > 0 ||
    draft.avatarUrl !== null ||
    runtimeId !== null
  );
}

/**
 * POST /api/agents body for the manual create form: private by default, the
 * caller becomes owner server-side, no skills/permission targets yet — those
 * are follow-up edits on the detail screen.
 */
export function buildAgentCreateRequest(
  draft: AgentCreateDraft,
  runtimeId: string,
): CreateAgentRequest {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    instructions: draft.instructions.trim() || undefined,
    avatar_url: draft.avatarUrl ?? undefined,
    runtime_id: runtimeId,
    visibility: "private",
    permission_mode: "private",
    invocation_targets: [],
    skill_ids: [],
  };
}

export interface AgentCreateErrors {
  nameError: string | null;
  formError: string | null;
}

function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return null;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/** 409 means the name is taken in this workspace; everything else is a form-level error. */
export function classifyAgentCreateError(
  error: unknown,
  fallbackMessage: string,
  conflictMessage: string,
): AgentCreateErrors {
  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage;
  return statusOf(error) === 409
    ? { nameError: conflictMessage, formError: null }
    : { nameError: null, formError: message };
}
