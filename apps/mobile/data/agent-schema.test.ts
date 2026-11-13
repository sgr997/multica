// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AgentSchema } from "./schemas";

describe("AgentSchema", () => {
  it("parses the detail fields Phase 1 edits", () => {
    const agent = AgentSchema.parse({
      id: "agent-1",
      workspace_id: "ws-1",
      runtime_id: "rt-1",
      runtime_availability: "unstable",
      name: "Builder",
      description: "Builds things",
      instructions: "Do the work",
      thinking_level: "high",
      service_tier: "priority",
      model: "gpt-5",
      skills: [{ id: "skill-1", name: "Deploy", description: "Ship it" }],
      updated_at: "2026-11-13T00:00:00Z",
    });

    expect(agent.thinking_level).toBe("high");
    expect(agent.service_tier).toBe("priority");
    expect(agent.runtime_availability).toBe("unstable");
    expect(agent.skills).toEqual([
      { id: "skill-1", name: "Deploy", description: "Ship it" },
    ]);
  });

  it("defaults absent execution fields and survives a malformed skill list", () => {
    const agent = AgentSchema.parse({ id: "agent-1", skills: ["bad"] });
    expect(agent.model).toBe("");
    expect(agent.thinking_level ?? "").toBe("");
    expect(agent.service_tier ?? "").toBe("");
    expect(agent.skills).toEqual([]);
  });

  it("keeps additive server fields without failing the parse", () => {
    const agent = AgentSchema.parse({ id: "agent-1", future_field: { a: 1 } });
    expect(agent.id).toBe("agent-1");
  });
});
