import { describe, expect, it } from "vitest";
import type { RuntimeDevice } from "@multica/core/types";
import {
  buildAgentCreateRequest,
  classifyAgentCreateError,
  isAgentCreateDraftDirty,
  isAgentCreateReady,
  isRuntimeSelectable,
  validateAgentCreateForm,
} from "./agent-create-form";

const USER = "user-1";

function runtime(overrides: Partial<RuntimeDevice> = {}): RuntimeDevice {
  return {
    id: "rt-1",
    workspace_id: "ws-1",
    daemon_id: "daemon-1",
    name: "PeiMac",
    runtime_mode: "local",
    provider: "claude",
    launch_header: "",
    status: "online",
    device_info: "",
    metadata: {},
    owner_id: USER,
    visibility: "private",
    last_seen_at: null,
    created_at: "2026-11-13T00:00:00Z",
    updated_at: "2026-11-13T00:00:00Z",
    ...overrides,
  };
}

describe("validateAgentCreateForm", () => {
  it("requires a non-whitespace name and an online, bindable runtime", () => {
    expect(validateAgentCreateForm({ name: "  " }, runtime(), USER)).toEqual({
      name: "required",
      runtime: null,
    });
    expect(validateAgentCreateForm({ name: "" }, null, USER).runtime).toBe(
      "missing",
    );
    expect(
      validateAgentCreateForm(
        { name: "Agent" },
        runtime({ status: "offline" }),
        USER,
      ).runtime,
    ).toBe("offline");
    expect(
      validateAgentCreateForm(
        { name: "Agent" },
        runtime({ owner_id: "someone-else" }),
        USER,
      ).runtime,
    ).toBe("forbidden");
  });

  it("is ready only when both required fields pass", () => {
    expect(isAgentCreateReady({ name: "Agent" }, runtime(), USER)).toBe(true);
    expect(
      isAgentCreateReady({ name: "Agent" }, runtime({ status: "offline" }), USER),
    ).toBe(false);
  });

  it("does not mark a bindable offline runtime as selectable", () => {
    expect(isRuntimeSelectable(runtime(), USER)).toBe(true);
    expect(isRuntimeSelectable(runtime({ status: "offline" }), USER)).toBe(false);
  });
});

describe("buildAgentCreateRequest", () => {
  it("creates a private agent with trim/de-dup defaults matching web", () => {
    expect(
      buildAgentCreateRequest(
        {
          name: "  Builder  ",
          description: " Builds things ",
          instructions: " Do it ",
          avatarUrl: "emoji:🤖",
        },
        "rt-1",
      ),
    ).toEqual({
      name: "Builder",
      description: "Builds things",
      instructions: "Do it",
      avatar_url: "emoji:🤖",
      runtime_id: "rt-1",
      visibility: "private",
      permission_mode: "private",
      invocation_targets: [],
      skill_ids: [],
    });
  });

  it("omits empty optional text instead of sending blank strings", () => {
    const request = buildAgentCreateRequest(
      { name: "Builder", description: "", instructions: "", avatarUrl: null },
      "rt-1",
    );
    expect(request.instructions).toBeUndefined();
    expect(request.avatar_url).toBeUndefined();
    expect(request.description).toBe("");
  });
});

describe("create-form helpers", () => {
  it("treats any typed value or picked runtime as dirty", () => {
    const empty = {
      name: "",
      description: "",
      instructions: "",
      avatarUrl: null,
    };
    expect(isAgentCreateDraftDirty(empty, null)).toBe(false);
    expect(isAgentCreateDraftDirty({ ...empty, name: "A" }, null)).toBe(true);
    expect(isAgentCreateDraftDirty(empty, "rt-1")).toBe(true);
  });

  it("maps 409 to a name error and everything else to a form error", () => {
    expect(
      classifyAgentCreateError(
        Object.assign(new Error("duplicate"), { status: 409 }),
        "failed",
        "name taken",
      ),
    ).toEqual({ nameError: "name taken", formError: null });
    expect(
      classifyAgentCreateError(
        Object.assign(new Error("runtime is gone"), { status: 400 }),
        "failed",
        "name taken",
      ),
    ).toEqual({ nameError: null, formError: "runtime is gone" });
  });
});
