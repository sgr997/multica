import { describe, expect, it } from "vitest";
import type { AgentInvocationTarget } from "@multica/core/types";
import {
  agentAccessScope,
  agentAccessTargets,
  buildAgentAccessPayload,
} from "./agent-access";

const workspaceTarget: AgentInvocationTarget = {
  target_type: "workspace",
  target_id: "ws-1",
};

describe("agentAccessScope", () => {
  it("maps private and public_to back to the editor rows", () => {
    expect(agentAccessScope("private", [])).toBe("private");
    expect(agentAccessScope("public_to", [workspaceTarget])).toBe("workspace");
    expect(
      agentAccessScope("public_to", [
        { target_type: "member", target_id: "u-1" },
      ]),
    ).toBe("allowlist");
  });

  it("fails safe to private when the mode is missing", () => {
    expect(agentAccessScope(undefined, [workspaceTarget])).toBe("private");
  });
});

describe("buildAgentAccessPayload", () => {
  it("private clears every target", () => {
    expect(buildAgentAccessPayload("private", ["u-1"])).toEqual({
      permission_mode: "private",
      invocation_targets: [],
    });
  });

  it("workspace sends one workspace target", () => {
    expect(buildAgentAccessPayload("workspace", ["u-1"])).toEqual({
      permission_mode: "public_to",
      invocation_targets: [{ target_type: "workspace" }],
    });
  });

  it("allowlist sends deduplicated member targets", () => {
    expect(
      buildAgentAccessPayload("allowlist", ["u-2", "u-1", "u-2", ""]),
    ).toEqual({
      permission_mode: "public_to",
      invocation_targets: [
        { target_type: "member", target_id: "u-2" },
        { target_type: "member", target_id: "u-1" },
      ],
    });
  });

  it("refuses an allowlist with no targets", () => {
    expect(buildAgentAccessPayload("allowlist", [])).toBeNull();
  });

  it("preserves inert team grants the phone cannot edit", () => {
    expect(
      buildAgentAccessPayload(
        "allowlist",
        ["u-1"],
        [{ target_type: "team", target_id: "squad-1" }],
      ),
    ).toEqual({
      permission_mode: "public_to",
      invocation_targets: [
        { target_type: "member", target_id: "u-1" },
        { target_type: "team", target_id: "squad-1" },
      ],
    });
  });
});

describe("agentAccessTargets", () => {
  it("splits member and team ids and ignores null workspace ids", () => {
    expect(
      agentAccessTargets([
        workspaceTarget,
        { target_type: "member", target_id: "u-1" },
        { target_type: "member", target_id: "u-1" },
        { target_type: "team", target_id: "t-1" },
        { target_type: "member", target_id: null },
      ]),
    ).toEqual({ memberIds: ["u-1"], teamIds: ["t-1"] });
  });
});
