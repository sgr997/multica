import { describe, expect, it } from "vitest";
import {
  buildRuntimeConfigPatch,
  clampConcurrency,
  normalizeCustomArgs,
  validateRuntimeConfigDraft,
} from "./agent-runtime-config";

describe("custom args", () => {
  it("trims entries and drops blanks", () => {
    expect(normalizeCustomArgs(["  --verbose ", "", "   ", "--x=1"])).toEqual([
      "--verbose",
      "--x=1",
    ]);
  });

  it("flags blank entries before save", () => {
    expect(
      validateRuntimeConfigDraft({
        customArgs: ["--ok", " "],
        maxConcurrentTasks: 2,
      }),
    ).toEqual({ kind: "empty_arg" });
  });

  it("passes provider-specific flags through to the server", () => {
    // ValidateCustomArgs owns the blocklist; the local draft must not reject
    // an argument the server may accept (or report its own version of it).
    expect(
      validateRuntimeConfigDraft({
        customArgs: ["--output-format"],
        maxConcurrentTasks: 1,
      }),
    ).toBeNull();
  });
});

describe("max concurrent tasks", () => {
  it("accepts the server range only", () => {
    expect(
      validateRuntimeConfigDraft({ customArgs: [], maxConcurrentTasks: 1 }),
    ).toBeNull();
    expect(
      validateRuntimeConfigDraft({ customArgs: [], maxConcurrentTasks: 50 }),
    ).toBeNull();
    expect(
      validateRuntimeConfigDraft({ customArgs: [], maxConcurrentTasks: 0 }),
    ).toEqual({ kind: "concurrency_range" });
    expect(
      validateRuntimeConfigDraft({ customArgs: [], maxConcurrentTasks: 51 }),
    ).toEqual({ kind: "concurrency_range" });
    expect(
      validateRuntimeConfigDraft({ customArgs: [], maxConcurrentTasks: 2.5 }),
    ).toEqual({ kind: "concurrency_range" });
  });

  it("clamps stepper input", () => {
    expect(clampConcurrency(0)).toBe(1);
    expect(clampConcurrency(99)).toBe(50);
    expect(clampConcurrency(Number.NaN)).toBe(1);
  });
});

describe("buildRuntimeConfigPatch", () => {
  it("sends only the two fields this block owns", () => {
    expect(
      buildRuntimeConfigPatch({
        customArgs: [" --verbose ", ""],
        maxConcurrentTasks: 3,
      }),
    ).toEqual({
      custom_args: ["--verbose"],
      max_concurrent_tasks: 3,
    });
  });
});
