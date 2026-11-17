// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("@/data/api", () => ({ api: {} }));

import { DEFAULT_MY_ISSUES_SCOPE } from "@/lib/my-issues-scopes";
import { useMyIssuesViewStore } from "@/data/stores/my-issues-view-store";
import { buildMyIssuesFilter } from "./my-issues";

describe("buildMyIssuesFilter", () => {
  it("uses the cold-start agents predicate and follows subsequent switches", () => {
    const filterForCurrentScope = () =>
      buildMyIssuesFilter(useMyIssuesViewStore.getState().scope, "user-1");

    expect(useMyIssuesViewStore.getState().scope).toBe(DEFAULT_MY_ISSUES_SCOPE);
    expect(filterForCurrentScope()).toEqual({ involves_user_id: "user-1" });

    useMyIssuesViewStore.getState().setScope("assigned");
    expect(filterForCurrentScope()).toEqual({ assignee_id: "user-1" });

    useMyIssuesViewStore.getState().setScope("created");
    expect(filterForCurrentScope()).toEqual({ created_by_user_id: "user-1" });

    useMyIssuesViewStore.getState().setScope("agents");
    expect(filterForCurrentScope()).toEqual({ involves_user_id: "user-1" });
  });
});
