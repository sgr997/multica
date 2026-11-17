// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_MY_ISSUES_SCOPE } from "@/lib/my-issues-scopes";
import { useMyIssuesViewStore } from "./my-issues-view-store";

afterEach(() => {
  useMyIssuesViewStore.setState({
    scope: DEFAULT_MY_ISSUES_SCOPE,
    statusFilters: [],
    priorityFilters: [],
  });
});

describe("useMyIssuesViewStore", () => {
  it("cold-starts on the agents scope", () => {
    expect(useMyIssuesViewStore.getState().scope).toBe("agents");
  });

  it("keeps explicit scope switches until the next switch", () => {
    useMyIssuesViewStore.getState().setScope("assigned");
    expect(useMyIssuesViewStore.getState().scope).toBe("assigned");

    useMyIssuesViewStore.getState().setScope("created");
    expect(useMyIssuesViewStore.getState().scope).toBe("created");

    useMyIssuesViewStore.getState().setScope("agents");
    expect(useMyIssuesViewStore.getState().scope).toBe("agents");
  });
});
