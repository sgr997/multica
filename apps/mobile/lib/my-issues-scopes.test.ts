// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DEFAULT_MY_ISSUES_SCOPE,
  MY_ISSUES_SCOPES,
} from "./my-issues-scopes";

describe("my issues scopes", () => {
  it("puts agents first so the default pill leads the row", () => {
    expect(MY_ISSUES_SCOPES).toEqual(["agents", "assigned", "created"]);
    expect(MY_ISSUES_SCOPES[0]).toBe("agents");
    expect(DEFAULT_MY_ISSUES_SCOPE).toBe("agents");
  });
});
