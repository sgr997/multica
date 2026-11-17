/**
 * My Issues scope order. `agents` leads because it is the cold-start default,
 * so the selected pill is also the leftmost one. Mobile's pill row has tight
 * width on SE3 (375pt), so labels stay short — the agents scope renders
 * "Agents" while its empty state still says "agents or squads".
 */
import type { MyIssuesScope } from "@/data/queries/issue-keys";

export const MY_ISSUES_SCOPES: readonly MyIssuesScope[] = [
  "agents",
  "assigned",
  "created",
];

export const DEFAULT_MY_ISSUES_SCOPE: MyIssuesScope = MY_ISSUES_SCOPES[0];
