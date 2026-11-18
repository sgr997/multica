/**
 * Pure list shaping for the Agents (collaboration) screen. Kept out of the
 * component so the grouping/filter rules can be tested without RN rendering.
 *
 * Sections follow the decision order the page is meant to answer:
 *
 *   working → available → offline → archived
 *
 * Availability only describes the runtime connection. "Working" and
 * "available" split the old `active` bucket because an online-but-idle agent
 * is not doing work, and the previous naming read as if it were.
 *
 * Archived is a membership bucket, not a presence state: an archived agent
 * must never appear in another section even if a stale runtime row still says
 * online. The server also excludes archived rows from the default list; the
 * screen always requests `include_archived=true` so the toggle can reveal
 * them without a second fetch.
 */
import type { AgentAvailability, AgentPresenceDetail } from "@multica/core/agents";
import type { Agent, AgentTask } from "@multica/core/types";

export type AgentSectionKey =
  | "working"
  | "available"
  | "offline"
  | "archived";

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

/**
 * True when queued work exists but its runtime cannot pick it up. Mirrors
 * web's stuck-agent rule (`availability !== "online" && queuedCount > 0`);
 * `unstable` counts because a runtime that just dropped may still be holding
 * the queue, and the user should see the same warning on both surfaces.
 */
export function needsAttention(
  agent: Agent,
  presence: AgentPresenceDetail | undefined,
): boolean {
  if (isArchivedAgent(agent, presence)) return false;
  if (!presence || presence.queuedCount <= 0) return false;
  return effectiveAvailability(agent, presence) !== "online";
}

/** `working` wins over runtime health, matching `summarizeSquadStatus`. */
export function isWorkingAgent(
  agent: Agent,
  presence: AgentPresenceDetail | undefined,
): boolean {
  if (isArchivedAgent(agent, presence)) return false;
  if (presence) {
    return presence.workload === "working" || presence.runningCount > 0;
  }
  return false;
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
  const working: Agent[] = [];
  const available: Agent[] = [];
  const offline: Agent[] = [];
  const archived: Agent[] = [];

  for (const agent of visible) {
    const presence = presenceByAgent.get(agent.id);
    const availability = effectiveAvailability(agent, presence);
    if (availability === "archived") {
      archived.push(agent);
    } else if (isWorkingAgent(agent, presence)) {
      working.push(agent);
    } else if (
      availability === "online" ||
      availability === "unstable"
    ) {
      available.push(agent);
    } else {
      offline.push(agent);
    }
  }

  const byName = (a: Agent, b: Agent) => a.name.localeCompare(b.name);
  working.sort(byName);
  available.sort(byName);
  offline.sort(byName);
  archived.sort(byName);

  return [
    { key: "working", agents: working },
    { key: "available", agents: available },
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

export interface AgentListSummary {
  /** Every non-archived agent whose runtime is connected. */
  live: number;
  /** Non-archived agents currently executing task work. */
  working: number;
  /** Agents with queued work stuck on an unreachable runtime. */
  attention: number;
}

/**
 * Counts for the summary strip. Archived agents are excluded from every
 * bucket: they are a hidden filter, not a live collaboration object.
 */
export function summarizeAgents(
  agents: readonly Agent[],
  presenceByAgent: ReadonlyMap<string, AgentPresenceDetail>,
): AgentListSummary {
  let live = 0;
  let working = 0;
  let attention = 0;

  for (const agent of agents) {
    const presence = presenceByAgent.get(agent.id);
    if (isArchivedAgent(agent, presence)) continue;
    const availability = effectiveAvailability(agent, presence);
    if (availability === "online" || availability === "unstable") live += 1;
    if (isWorkingAgent(agent, presence)) working += 1;
    if (needsAttention(agent, presence)) attention += 1;
  }

  return { live, working, attention };
}

function providerDisplayName(provider: string): string {
  const trimmed = provider.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toLocaleUpperCase() + trimmed.slice(1);
}

export interface AgentRuntimeParts {
  /** Human-facing provider name, e.g. `Codex`. */
  provider: string;
  /** Machine name without the daemon suffix noise, e.g. `PeiMac-mini.local`. */
  machine: string;
}

/**
 * Splits the runtime row into the two pieces the compact third line needs.
 * The caller decides which one to show: an idle row only needs the provider
 * plus connection state, while a working row also names the machine.
 */
export function agentRuntimeParts(
  runtime: { provider?: string | null; name?: string | null; custom_name?: string | null } | null,
): AgentRuntimeParts {
  if (!runtime) return { provider: "", machine: "" };
  return {
    provider: providerDisplayName(runtime.provider ?? ""),
    machine: runtime.custom_name?.trim() || runtime.name?.trim() || "",
  };
}

export interface AttentionEntry {
  agent: Agent;
  /** Queued tasks as reported by presence; drives the headline count. */
  count: number;
  /**
   * The queued task rows themselves. The snapshot endpoint backs the
   * presence map, so this is usually populated; an older backend that lacks
   * the route leaves it empty and the card falls back to detail navigation.
   */
  tasks: AgentTask[];
}

/**
 * Groups stuck queued work per agent for the needs-attention card. Ordered
 * by largest backlog first so the headline names the agent that most needs
 * the user, then by name to stay stable across refreshes.
 */
export function collectAttention(
  agents: readonly Agent[],
  tasks: readonly AgentTask[],
  presenceByAgent: ReadonlyMap<string, AgentPresenceDetail>,
): AttentionEntry[] {
  const entries: AttentionEntry[] = [];
  for (const agent of agents) {
    const presence = presenceByAgent.get(agent.id);
    if (!needsAttention(agent, presence)) continue;
    entries.push({
      agent,
      count: presence?.queuedCount ?? 0,
      tasks: tasks.filter(
        (task) => task.agent_id === agent.id && task.status === "queued",
      ),
    });
  }
  return entries.sort(
    (a, b) => b.count - a.count || a.agent.name.localeCompare(b.agent.name),
  );
}
