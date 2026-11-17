import { describe, expect, it } from "vitest";
import { UpdateAgentRequestSchema } from "./schemas";

describe("UpdateAgentRequestSchema", () => {
  it("keeps the phase-2b fields on the wire", () => {
    const body = UpdateAgentRequestSchema.parse({
      custom_args: ["--verbose"],
      max_concurrent_tasks: 4,
      permission_mode: "public_to",
      invocation_targets: [
        { target_type: "workspace" },
        { target_type: "member", target_id: "u-1" },
      ],
    });

    expect(body).toEqual({
      custom_args: ["--verbose"],
      max_concurrent_tasks: 4,
      permission_mode: "public_to",
      invocation_targets: [
        { target_type: "workspace" },
        { target_type: "member", target_id: "u-1" },
      ],
    });
  });

  it("rejects custom_env, which this endpoint refuses", () => {
    expect(() =>
      UpdateAgentRequestSchema.parse({
        name: "n",
        custom_env: { A: "b" },
      }),
    ).toThrow();
  });

  it("rejects concurrency outside the server range", () => {
    expect(() =>
      UpdateAgentRequestSchema.parse({ max_concurrent_tasks: 0 }),
    ).toThrow();
    expect(() =>
      UpdateAgentRequestSchema.parse({ max_concurrent_tasks: 51 }),
    ).toThrow();
  });
});
