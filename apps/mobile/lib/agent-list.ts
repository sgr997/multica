/**
 * Pure list shaping for the Agents screen. Kept out of the component so the
 * grouping/filter rules can be tested without RN rendering:
 *
 *   active (online or unstable) → offline → archived
 *
 * Archived is a membership bucket, not a presence state: an archived agent
 * must never appear in active/offline even if a stale runtime row still says
 * online. The server also excludes archived rows from the default list; the
 * screen always requests `include_archived=true` so the toggle can reveal
 * them without a second fetch.
 */
import type { AgentAvailability, AgentPresenceDetail } from "@multica/core/agents";
import type { Agent } from "@multica/core/types";

export type AgentSectionKey = "active" | "offline" | "archived";

export interface AgentSection {
  key: AgentSectionKey;
  agents: Agent[];
}

export interface AgentListFilter {
  query: string;
  runtimeId: string | null;
  showArchived: boolean;
}

export function isArchivedAgent(
  agent: Agent,
  presence: AgentPresenceDetail | undefined,
): boolean {
  return !!agent.archived_at || presence?.availability === "archived";
}

/**
 * Availability to paint before/without the workspace presence map. Archived
 * wins; otherwise fall back to the server's coarse projection
 * (`runtime_availability`) so a cold list does not paint every online agent
 * as offline while three queries are still in flight.
 */
export function effectiveAvailability(
  agent: Agent,
  presence: AgentPresenceDetail | undefined,
): AgentAvailability {
  if (isArchivedAgent(agent, presence)) return "archived";
  if (presence) return presence.availability;
  return agent.runtime_availability ?? "offline";
}

export function activeTaskCount(
  presence: AgentPresenceDetail | undefined,
): number {
  if (!presence) return 0;
  return presence.runningCount + presence.queuedCount;
}

export function filterAgents(
  agents: readonly Agent[],
  presenceByAgent: ReadonlyMap<string, AgentPresenceDetail>,
  filter: AgentListFilter,
): Agent[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return agents.filter((agent) => {
    if (
      !filter.showArchived &&
      isArchivedAgent(agent, presenceByAgent.get(agent.id))
    ) {
      return false;
    }
    if (filter.runtimeId && agent.runtime_id !== filter.runtimeId) {
      return false;
    }
    if (!query) return true;
    return (
      agent.name.toLocaleLowerCase().includes(query) ||
      agent.description.toLocaleLowerCase().includes(query)
    );
  });
}

export function groupAgents(
  agents: readonly Agent[],
  presenceByAgent: ReadonlyMap<string, AgentPresenceDetail>,
  filter: AgentListFilter,
): AgentSection[] {
  const visible = filterAgents(agents, presenceByAgent, filter);
  const active: Agent[] = [];
  const offline: Agent[] = [];
  const archived: Agent[] = [];

  for (const agent of visible) {
    const presence = presenceByAgent.get(agent.id);
    const availability = effectiveAvailability(agent, presence);
    if (availability === "archived") {
      archived.push(agent);
    } else if (
      availability === "online" ||
      availability === "unstable"
    ) {
      active.push(agent);
    } else {
      offline.push(agent);
    }
  }

  const byName = (a: Agent, b: Agent) => a.name.localeCompare(b.name);
  active.sort(byName);
  offline.sort(byName);
  archived.sort(byName);

  return [
    { key: "active", agents: active },
    { key: "offline", agents: offline },
    { key: "archived", agents: archived },
  ].filter((section) => section.agents.length > 0) as AgentSection[];
}

export function countArchived(
  agents: readonly Agent[],
  presenceByAgent: ReadonlyMap<string, AgentPresenceDetail>,
): number {
  return agents.filter((agent) =>
    isArchivedAgent(agent, presenceByAgent.get(agent.id)),
  ).length;
}
