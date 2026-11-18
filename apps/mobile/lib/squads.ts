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

/** The membership fields needed to decide whether a squad is "mine". Squad
 *  previews and full member rows both satisfy this shape. */
export type SquadInvolvementMember = Pick<
  SquadMember,
  "member_type" | "member_id"
>;

export interface SquadListFilter {
  query: string;
  scope: SquadScope;
  /** IDs derived from squad membership; only used for scope === "mine". */
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
 * Mirrors `ListInvolvedSquadIDs` in server/pkg/db/queries/squad.sql:
 * the caller is a member, the caller owns the leader agent, or the caller
 * owns an agent that is a member of the squad.
 */
export function isSquadInvolved(
  squad: Pick<Squad, "leader_id">,
  members: readonly SquadInvolvementMember[],
  userId: string | null | undefined,
  ownedAgentIds: ReadonlySet<string>,
): boolean {
  if (!userId) return false;
  if (squad.leader_id && ownedAgentIds.has(squad.leader_id)) return true;
  return members.some(
    (member) =>
      (member.member_type === "member" && member.member_id === userId) ||
      (member.member_type === "agent" &&
        ownedAgentIds.has(member.member_id)),
  );
}

/**
 * A squad's preview is capped at three members. When the preview length
 * reaches `member_count` it is complete and can answer involvement without
 * another request; otherwise the caller must load the full member list.
 */
export function hasCompleteMemberPreview(
  squad: Pick<Squad, "member_count" | "member_preview">,
): boolean {
  const preview = squad.member_preview ?? [];
  const count = squad.member_count;
  return typeof count === "number" && preview.length >= count;
}

export function squadsNeedingMemberLookup(
  squads: readonly Squad[],
  ownedAgentIds: ReadonlySet<string>,
): Squad[] {
  return squads.filter(
    (squad) =>
      !(squad.leader_id && ownedAgentIds.has(squad.leader_id)) &&
      !hasCompleteMemberPreview(squad),
  );
}

export function collectInvolvedSquadIds(
  squads: readonly Squad[],
  membersBySquad: ReadonlyMap<string, readonly SquadInvolvementMember[]>,
  userId: string | null | undefined,
  ownedAgentIds: ReadonlySet<string>,
): string[] {
  if (!userId) return [];
  return squads
    .filter((squad) =>
      isSquadInvolved(
        squad,
        membersBySquad.get(squad.id) ?? [],
        userId,
        ownedAgentIds,
      ),
    )
    .map((squad) => squad.id);
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

const SQUAD_STATUS_ORDER: Record<SquadStatusSummary | "archived", number> = {
  working: 0,
  idle: 1,
  unstable: 2,
  offline: 3,
  archived: 4,
};

export function squadStatusRank(
  squad: Pick<Squad, "archived_at">,
  leaderPresence: AgentPresenceDetail | undefined,
): number {
  if (squad.archived_at) return SQUAD_STATUS_ORDER.archived;
  return SQUAD_STATUS_ORDER[summarizeSquadStatus(leaderPresence)];
}

/**
 * Working squads first, then idle, unstable, offline, and archived last.
 * Archived rows used to sort merely "after live rows" by a boolean, which
 * still mixed offline squads above usable ones. Ties fall back to name so
 * the order never jitters between refreshes.
 */
export function sortSquads(
  squads: readonly Squad[],
  presenceByAgent: ReadonlyMap<string, AgentPresenceDetail>,
): Squad[] {
  return [...squads].sort((a, b) => {
    const rankA = squadStatusRank(a, presenceByAgent.get(a.leader_id));
    const rankB = squadStatusRank(b, presenceByAgent.get(b.leader_id));
    if (rankA !== rankB) return rankA - rankB;
    return a.name.localeCompare(b.name);
  });
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
