// @vitest-environment node
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import type { Issue, TimelineEntry } from "@multica/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/data/api";
import { issueKeys } from "@/data/queries/issue-keys";
import { useBatchDeleteIssues, useBatchUpdateIssues } from "./issues";

const state = vi.hoisted(() => ({
  qc: undefined as unknown as QueryClient,
  wsId: "workspace-1",
  observer: undefined as unknown as MutationObserver<
    unknown,
    unknown,
    unknown,
    unknown
  >,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => state.qc,
    useMutation: (
      options: ConstructorParameters<typeof actual.MutationObserver>[1],
    ) => {
      const observer = new actual.MutationObserver(state.qc, options);
      state.observer = observer;
      return {
        mutateAsync: (variables: unknown) => observer.mutate(variables),
      };
    },
  };
});

vi.mock("@/data/api", () => ({
  api: {
    batchUpdateIssues: vi.fn(async () => ({ updated: 2 })),
    batchDeleteIssues: vi.fn(async () => ({ deleted: 2 })),
  },
}));

vi.mock("@/data/auth-store", () => ({ useAuthStore: vi.fn() }));

vi.mock("@/data/workspace-store", () => ({
  useWorkspaceStore: (
    selector: (value: { currentWorkspaceId: string }) => unknown,
  ) => selector({ currentWorkspaceId: state.wsId }),
}));

const wsId = "workspace-1";
const issueA = { id: "issue-a", identifier: "MUL-1" } as Issue;
const issueB = { id: "issue-b", identifier: "MUL-2" } as Issue;

function seedIssues() {
  state.qc.setQueryData<Issue[]>(issueKeys.list(wsId), [issueA, issueB]);
  state.qc.setQueryData<Issue[]>(
    issueKeys.myList(wsId, "assigned", { assignee_id: "user-1" }),
    [issueA, issueB],
  );
  state.qc.setQueryData<Issue>(issueKeys.detail(wsId, issueA.id), issueA);
  state.qc.setQueryData<Issue>(issueKeys.detail(wsId, issueB.id), issueB);
  state.qc.setQueryData<TimelineEntry[]>(issueKeys.timeline(wsId, issueA.id), []);
}

describe("batch issue mutations", () => {
  beforeEach(() => {
    state.qc = new QueryClient();
    vi.mocked(api.batchUpdateIssues).mockReset();
    vi.mocked(api.batchDeleteIssues).mockReset();
  });

  it("invalidates the visible lists and details after a batch update", async () => {
    seedIssues();
    vi.mocked(api.batchUpdateIssues).mockResolvedValue({ updated: 2 });
    const invalidate = vi.spyOn(state.qc, "invalidateQueries");

    await useBatchUpdateIssues().mutateAsync({
      ids: [issueA.id, issueB.id],
      updates: { priority: "high" },
    });

    expect(api.batchUpdateIssues).toHaveBeenCalledWith(
      [issueA.id, issueB.id],
      { priority: "high" },
    );
    const invalidatedKeys = invalidate.mock.calls.map(
      ([filter]) => filter?.queryKey,
    );
    expect(invalidatedKeys).toContainEqual(issueKeys.list(wsId));
    expect(invalidatedKeys).toContainEqual(issueKeys.myAll(wsId));
    expect(invalidatedKeys).toContainEqual(issueKeys.detail(wsId, issueA.id));
    expect(invalidatedKeys).toContainEqual(issueKeys.detail(wsId, issueB.id));
  });

  it("also refetches when the server reports a partial update", async () => {
    seedIssues();
    vi.mocked(api.batchUpdateIssues).mockResolvedValue({ updated: 1 });

    await useBatchUpdateIssues().mutateAsync({
      ids: [issueA.id, issueB.id],
      updates: { status: "done" },
    });

    expect(state.qc.getQueryState(issueKeys.list(wsId))?.isInvalidated).toBe(
      true,
    );
  });

  it("does not move caches when the batch update fails", async () => {
    seedIssues();
    vi.mocked(api.batchUpdateIssues).mockRejectedValue(new Error("nope"));

    await expect(
      useBatchUpdateIssues().mutateAsync({
        ids: [issueA.id],
        updates: { priority: "low" },
      }),
    ).rejects.toThrow("nope");

    expect(state.qc.getQueryState(issueKeys.list(wsId))?.isInvalidated).toBe(
      false,
    );
    expect(state.qc.getQueryData(issueKeys.list(wsId))).toEqual([
      issueA,
      issueB,
    ]);
  });

  it("removes deleted rows from lists and drops their record caches", async () => {
    seedIssues();
    vi.mocked(api.batchDeleteIssues).mockResolvedValue({ deleted: 2 });

    await useBatchDeleteIssues().mutateAsync([issueA.id, issueB.id]);

    expect(state.qc.getQueryData(issueKeys.list(wsId))).toEqual([]);
    expect(
      state.qc.getQueryData(
        issueKeys.myList(wsId, "assigned", { assignee_id: "user-1" }),
      ),
    ).toEqual([]);
    expect(state.qc.getQueryData(issueKeys.detail(wsId, issueA.id))).toBe(
      undefined,
    );
    expect(state.qc.getQueryData(issueKeys.timeline(wsId, issueA.id))).toBe(
      undefined,
    );
  });
});
