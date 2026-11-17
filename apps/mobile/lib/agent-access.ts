import type {
  AgentInvocationTarget,
  AgentInvocationTargetInput,
  AgentPermissionMode,
} from "@multica/core/types";

/**
 * The three choices the mobile access editor shows. Mirrors web's
 * `AccessScope` and the backend's `effectiveAccessScope` derivation:
 * `private` -> owner only, `workspace` -> every member, `allowlist` ->
 * specific members.
 */
export type AgentAccessScope = "private" | "workspace" | "allowlist";

export interface AgentAccessChange {
  permission_mode: AgentPermissionMode;
  invocation_targets: AgentInvocationTargetInput[];
}

/** Derive the editor's selected row from the agent's authoritative fields. */
export function agentAccessScope(
  permissionMode: AgentPermissionMode | undefined | null,
  targets: readonly AgentInvocationTarget[] | undefined | null,
): AgentAccessScope {
  if (permissionMode !== "public_to") return "private";
  return (targets ?? []).some((target) => target.target_type === "workspace")
    ? "workspace"
    : "allowlist";
}

/** Member / team targets currently backing an allowlist agent. */
export function agentAccessTargets(
  targets: readonly AgentInvocationTarget[] | undefined | null,
): { memberIds: string[]; teamIds: string[] } {
  const memberIds: string[] = [];
  const teamIds: string[] = [];
  for (const target of targets ?? []) {
    if (target.target_id === null) continue;
    if (target.target_type === "member" && !memberIds.includes(target.target_id)) {
      memberIds.push(target.target_id);
    }
    if (target.target_type === "team" && !teamIds.includes(target.target_id)) {
      teamIds.push(target.target_id);
    }
  }
  return { memberIds, teamIds };
}

/**
 * Build the `PUT /api/agents/{id}` permission payload. Team grants are inert
 * in V1 and not editable on mobile, so an existing team target is preserved
 * (dropping it from an unrelated member edit would silently rewrite a grant
 * the phone never showed). Returns null when the draft is not committable:
 * an allowlist with no target would be normalised by the server to
 * "workspace", which is the opposite of what the user picked.
 */
export function buildAgentAccessPayload(
  scope: AgentAccessScope,
  memberIds: readonly string[],
  existingTargets: readonly AgentInvocationTarget[] = [],
): AgentAccessChange | null {
  if (scope === "private") {
    return { permission_mode: "private", invocation_targets: [] };
  }

  if (scope === "workspace") {
    return {
      permission_mode: "public_to",
      invocation_targets: [{ target_type: "workspace" }],
    };
  }

  const uniqueMembers = [...new Set(memberIds.filter(Boolean))];
  const { teamIds } = agentAccessTargets(existingTargets);
  if (uniqueMembers.length === 0 && teamIds.length === 0) return null;

  return {
    permission_mode: "public_to",
    invocation_targets: [
      ...uniqueMembers.map(
        (id): AgentInvocationTargetInput => ({
          target_type: "member",
          target_id: id,
        }),
      ),
      ...teamIds.map(
        (id): AgentInvocationTargetInput => ({
          target_type: "team",
          target_id: id,
        }),
      ),
    ],
  };
}
