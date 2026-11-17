// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(async () => {}),
  clearWorkspace: vi.fn(async () => {}),
  clearQueries: vi.fn(() => {}),
  invalidateEpoch: vi.fn(() => {}),
}));

vi.mock("./query-client", () => ({
  queryClient: { clear: mocks.clearQueries },
}));
vi.mock("./auth-store", () => ({
  useAuthStore: { getState: () => ({ logout: mocks.logout }) },
}));
vi.mock("./workspace-store", () => ({
  useWorkspaceStore: { getState: () => ({ clear: mocks.clearWorkspace }) },
}));
vi.mock("./session-epoch", () => ({
  invalidateSessionEpoch: mocks.invalidateEpoch,
}));

import { resetClientDataForServerSwitch } from "./session-reset";

describe("resetClientDataForServerSwitch", () => {
  it("invalidates auth, workspace, and query state", async () => {
    await resetClientDataForServerSwitch();

    expect(mocks.invalidateEpoch).toHaveBeenCalledOnce();
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(mocks.clearWorkspace).toHaveBeenCalledOnce();
    expect(mocks.clearQueries).toHaveBeenCalledOnce();
  });
});
