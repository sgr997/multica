import { describe, expect, it } from "vitest";
import type { RuntimeDevice } from "@multica/core/types";
import { bindableRuntimes, canBindRuntime } from "./runtime-access";

const OWNER = "user-owner";
const OTHER = "user-other";

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
    owner_id: OWNER,
    visibility: "private",
    last_seen_at: null,
    created_at: "2026-11-13T00:00:00Z",
    updated_at: "2026-11-13T00:00:00Z",
    ...overrides,
  };
}

describe("canBindRuntime", () => {
  it("lets the owner bind their own private runtime", () => {
    expect(canBindRuntime(runtime(), OWNER)).toBe(true);
  });

  it("refuses another member's private runtime without a grant", () => {
    expect(canBindRuntime(runtime(), OTHER)).toBe(false);
  });

  it("allows explicitly shared members on a private runtime", () => {
    expect(canBindRuntime(runtime({ shared_with: [OTHER] }), OTHER)).toBe(true);
  });

  it("opens a public runtime to any workspace member", () => {
    expect(canBindRuntime(runtime({ visibility: "public" }), OTHER)).toBe(true);
  });

  it("refuses an ownerless runtime even when public", () => {
    expect(
      canBindRuntime(runtime({ owner_id: null, visibility: "public" }), OTHER),
    ).toBe(false);
  });

  it("treats an unknown viewer as allowed until auth resolves", () => {
    expect(canBindRuntime(runtime(), null)).toBe(true);
  });
});

describe("bindableRuntimes", () => {
  it("keeps offline runtimes so the picker can label them", () => {
    const rows = [
      runtime({ id: "online" }),
      runtime({ id: "offline", status: "offline" }),
      runtime({ id: "someone-else", owner_id: "stranger" }),
    ];
    expect(bindableRuntimes(rows, OWNER).map((row) => row.id)).toEqual([
      "online",
      "offline",
    ]);
  });
});
