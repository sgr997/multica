// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decideAgentSave } from "./agent-save-conflict";

describe("decideAgentSave", () => {
  it("proceeds when the loaded revision is still current", () => {
    expect(
      decideAgentSave({
        baseUpdatedAt: "2026-11-13T00:00:00Z",
        latestUpdatedAt: "2026-11-13T00:00:00Z",
      }),
    ).toBe("proceed");
  });

  it("reports a conflict when another editor moved updated_at", () => {
    expect(
      decideAgentSave({
        baseUpdatedAt: "2026-11-13T00:00:00Z",
        latestUpdatedAt: "2026-11-13T00:05:00Z",
      }),
    ).toBe("conflict");
  });

  it("proceeds when the user explicitly overwrites", () => {
    expect(
      decideAgentSave({
        baseUpdatedAt: "2026-11-13T00:00:00Z",
        latestUpdatedAt: "2026-11-13T00:05:00Z",
        overwrite: true,
      }),
    ).toBe("proceed");
  });

  it("fails open for legacy responses without timestamps", () => {
    expect(
      decideAgentSave({ baseUpdatedAt: "", latestUpdatedAt: "" }),
    ).toBe("proceed");
    expect(
      decideAgentSave({ baseUpdatedAt: null, latestUpdatedAt: "x" }),
    ).toBe("proceed");
  });
});
