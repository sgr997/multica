/**
 * Pure squad list / permission / membership helpers.
 *
 * Kept out of the screens so the rules can be unit-tested without RN:
 *   - scope filtering mirrors web's `mine` / `all` switch, but `mine` is
 *     membership-based (`/api/squads/involved`) rather than creator-based;
 *   - the management gate mirrors `canManageSquad` in
 *     `server/internal/handler/squad.go` so the UI never renders a write
 *     control the API will reject with 403;
 *   - the add-member diff is a set operation over `(member_type, member_id)`.
 */
import type { AgentPresenceDetail } from "@multica/core/agents";
import type {
  Agent,
  Squad,
  SquadMember,
  SquadMemberType,
} from "@multica/core/types";

export type SquadScope = "all" | "mine";

export type SquadStatusSummary = "working" | "idle" | "offline" | "unstable";

export interface SquadMemberKey {
  member_type: SquadMemberType;
  member_id: string;
}

export interface SquadListFilter {
  query: string;
  scope: SquadScope;
  /** IDs returned by `/api/squads/involved`; only used for scope === "mine". */
  involvedIds: ReadonlySet<string>;
}

export function squadMemberKey(
  memberType: SquadMemberType | string,
  memberId: string,
): string {
  return `${memberType}:${memberId}`;
}

export function filterSquads(
  squads: readonly Squad[],
  filter: SquadListFilter,
): Squad[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return squads.filter((squad) => {
    if (filter.scope === "mine" && !filter.involvedIds.has(squad.id)) {
      return false;
    }
    if (!query) return true;
    return squad.name.toLocaleLowerCase().includes(query);
  });
}

/**
 * Workspace owner/admin manage every squad; a regular member manages only
 * the squads they created. Mirrors `canManageSquad` in squad.go.
 */
export function canManageSquad(
  squad: Pick<Squad, "creator_id">,
  userId: string | null | undefined,
  role: string | null | undefined,
): boolean {
  if (role === "owner" || role === "admin") return true;
  return !!userId && squad.creator_id === userId;
}

export function diffSquadMembers(
  existing: readonly SquadMemberKey[],
  selected: readonly SquadMemberKey[],
): { toAdd: SquadMemberKey[]; toRemove: SquadMemberKey[] } {
  const existingKeys = new Set(
    existing.map((m) => squadMemberKey(m.member_type, m.member_id)),
  );
  const selectedKeys = new Set(
    selected.map((m) => squadMemberKey(m.member_type, m.member_id)),
  );

  return {
    toAdd: selected.filter(
      (m) => !existingKeys.has(squadMemberKey(m.member_type, m.member_id)),
    ),
    toRemove: existing.filter(
      (m) => !selectedKeys.has(squadMemberKey(m.member_type, m.member_id)),
    ),
  };
}

/** Leader presence is the squad-level summary on the list row: the leader is
 *  the actor that receives squad-assigned work. `working` wins over runtime
 *  health, matching the server's deriveSquadMemberStatus precedence. */
export function summarizeSquadStatus(
  leaderPresence: AgentPresenceDetail | undefined,
): SquadStatusSummary {
  if (!leaderPresence) return "offline";
  if (
    leaderPresence.workload === "working" ||
    leaderPresence.runningCount > 0
  ) {
    return "working";
  }
  if (leaderPresence.availability === "online") return "idle";
  if (leaderPresence.availability === "unstable") return "unstable";
  return "offline";
}

export function squadLeader(
  agents: readonly Agent[],
  squad: Pick<Squad, "leader_id">,
): Agent | undefined {
  return agents.find((agent) => agent.id === squad.leader_id);
}

export function squadMemberTypeLabel(
  memberType: SquadMemberType | string,
): "agent" | "member" {
  return memberType === "member" ? "member" : "agent";
}

export function squadMemberSelection(
  members: readonly SquadMember[],
): SquadMemberKey[] {
  return members.map((member) => ({
    member_type: member.member_type,
    member_id: member.member_id,
  }));
}
