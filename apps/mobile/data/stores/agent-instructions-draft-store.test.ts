// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { useAgentInstructionsDraftStore } from "./agent-instructions-draft-store";

describe("agent instructions draft store", () => {
  beforeEach(() => {
    useAgentInstructionsDraftStore.setState({ drafts: {} });
  });

  it("keeps drafts separate per agent", () => {
    const store = useAgentInstructionsDraftStore.getState();
    store.setDraft("a", "agent a", "rev-1");
    store.setDraft("b", "agent b", "rev-1");
    expect(useAgentInstructionsDraftStore.getState().drafts.a.content).toBe(
      "agent a",
    );
    expect(useAgentInstructionsDraftStore.getState().drafts.b.content).toBe(
      "agent b",
    );
  });

  it("preserves the revision the draft started from", () => {
    const store = useAgentInstructionsDraftStore.getState();
    store.setDraft("a", "first", "rev-1");
    store.setDraft("a", "second", "rev-2");
    expect(useAgentInstructionsDraftStore.getState().drafts.a).toEqual({
      content: "second",
      baseUpdatedAt: "rev-1",
    });
  });

  it("clears a draft after save", () => {
    const store = useAgentInstructionsDraftStore.getState();
    store.setDraft("a", "text", "rev-1");
    store.clearDraft("a");
    expect(useAgentInstructionsDraftStore.getState().drafts.a).toBeUndefined();
  });
});
