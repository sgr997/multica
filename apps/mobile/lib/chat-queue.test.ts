import { describe, expect, it } from "vitest";
import { canSteerQueuedTask, shouldPromptSendMode } from "./chat-queue";

describe("canSteerQueuedTask", () => {
  it("allows only executing head states", () => {
    expect(canSteerQueuedTask("dispatched")).toBe(true);
    expect(canSteerQueuedTask("running")).toBe(true);
    expect(canSteerQueuedTask("waiting_local_directory")).toBe(true);
  });

  it("rejects a head that has not started yet", () => {
    expect(canSteerQueuedTask("queued")).toBe(false);
    expect(canSteerQueuedTask(undefined)).toBe(false);
    expect(canSteerQueuedTask("completed")).toBe(false);
  });
});

describe("shouldPromptSendMode", () => {
  it("prompts only while running with queue support", () => {
    expect(shouldPromptSendMode({ isRunning: true, supportsQueue: true })).toBe(true);
    expect(shouldPromptSendMode({ isRunning: true, supportsQueue: false })).toBe(false);
    expect(shouldPromptSendMode({ isRunning: true, supportsQueue: undefined })).toBe(false);
    expect(shouldPromptSendMode({ isRunning: false, supportsQueue: true })).toBe(false);
  });
});
