import type { InboxItem } from "@multica/core/types";
import { describe, expect, it, vi } from "vitest";
import {
  archiveInboxIssueRows,
  completeInboxIssue,
  inboxRowsForIssue,
  isIssueDoneOrCancelled,
  shouldShowInboxCompleteButton,
} from "./inbox-complete";

function inboxItem(overrides: Partial<InboxItem>): InboxItem {
  return {
    id: "inbox-1",
    workspace_id: "workspace-1",
    recipient_type: "member",
    recipient_id: "member-1",
    actor_type: "agent",
    actor_id: "agent-1",
    type: "new_comment",
    severity: "info",
    issue_id: "issue-1",
    title: "Issue title",
    body: null,
    issue_status: "todo",
    read: false,
    archived: false,
    created_at: "2026-11-13T08:00:00Z",
    details: null,
    ...overrides,
  };
}

describe("shouldShowInboxCompleteButton", () => {
  const openIssue = { status: "todo" as const };

  it("shows only for an inbox-opened, unfinished issue the viewer can edit", () => {
    expect(
      shouldShowInboxCompleteButton({
        fromInbox: true,
        issue: openIssue,
        canEdit: true,
        isCompleting: false,
      }),
    ).toBe(true);
  });

  it.each([
    ["not opened from the inbox", { fromInbox: false, issue: openIssue, canEdit: true }],
    ["the viewer cannot edit", { fromInbox: true, issue: openIssue, canEdit: false }],
    ["the issue is done", { fromInbox: true, issue: { status: "done" as const }, canEdit: true }],
    ["the issue is cancelled", { fromInbox: true, issue: { status: "cancelled" as const }, canEdit: true }],
    [
      "a custom status in the done category",
      { fromInbox: true, issue: { status: "shipped", status_category: "done" as const }, canEdit: true },
    ],
    [
      "a custom status in the closed category",
      { fromInbox: true, issue: { status: "won't_do", status_category: "closed" as const }, canEdit: true },
    ],
    ["the issue is missing", { fromInbox: true, issue: null, canEdit: true }],
  ])("hides when %s", (_label, args) => {
    expect(
      shouldShowInboxCompleteButton({ ...args, isCompleting: false }),
    ).toBe(false);
  });

  it("keeps the button mounted while completion is in flight", () => {
    expect(
      shouldShowInboxCompleteButton({
        fromInbox: true,
        issue: { status: "done" as const },
        canEdit: true,
        isCompleting: true,
      }),
    ).toBe(true);
  });
});

describe("isIssueDoneOrCancelled", () => {
  it("accepts built-in done and cancelled keys", () => {
    expect(isIssueDoneOrCancelled({ status: "done" })).toBe(true);
    expect(isIssueDoneOrCancelled({ status: "cancelled" })).toBe(true);
  });

  it("uses the category for custom statuses", () => {
    expect(
      isIssueDoneOrCancelled({ status: "shipped", status_category: "done" }),
    ).toBe(true);
    expect(
      isIssueDoneOrCancelled({ status: "dropped", status_category: "closed" }),
    ).toBe(true);
    expect(
      isIssueDoneOrCancelled({ status: "building", status_category: "started" }),
    ).toBe(false);
  });
});

describe("inboxRowsForIssue", () => {
  it("keeps only unarchived rows for the issue", () => {
    const rows = inboxRowsForIssue(
      [
        inboxItem({ id: "a" }),
        inboxItem({ id: "b", archived: true }),
        inboxItem({ id: "c", issue_id: "issue-2" }),
      ],
      "issue-1",
    );
    expect(rows.map((row) => row.id)).toEqual(["a"]);
  });
});

describe("completeInboxIssue", () => {
  it("writes the status before archiving every cached row", async () => {
    const calls: string[] = [];
    const result = await completeInboxIssue({
      issueId: "issue-1",
      updateStatus: async () => {
        calls.push("status");
      },
      listRows: () => [
        inboxItem({ id: "a" }),
        inboxItem({ id: "b" }),
        inboxItem({ id: "archived", archived: true }),
        inboxItem({ id: "other", issue_id: "issue-2" }),
      ],
      archiveRow: async (id) => {
        calls.push(`archive:${id}`);
      },
    });

    expect(calls).toEqual(["status", "archive:a", "archive:b"]);
    expect(result).toEqual({
      statusUpdated: true,
      archivedIds: ["a", "b"],
      archiveError: null,
    });
  });

  it("does not archive when the status write fails", async () => {
    const archiveRow = vi.fn(async () => undefined);
    await expect(
      completeInboxIssue({
        issueId: "issue-1",
        updateStatus: async () => {
          throw new Error("status failed");
        },
        listRows: () => [inboxItem({ id: "a" })],
        archiveRow,
      }),
    ).rejects.toThrow("status failed");
    expect(archiveRow).not.toHaveBeenCalled();
  });

  it("keeps the status success and reports the archive failure", async () => {
    const archiveError = new Error("archive failed");
    const archiveRow = vi
      .fn(async (_id: string) => undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(archiveError);

    const result = await completeInboxIssue({
      issueId: "issue-1",
      updateStatus: async () => undefined,
      listRows: () => [inboxItem({ id: "a" }), inboxItem({ id: "b" })],
      archiveRow,
    });

    expect(result).toEqual({
      statusUpdated: true,
      archivedIds: ["a"],
      archiveError,
    });
    expect(archiveRow).toHaveBeenCalledTimes(2);
  });

  it("runs one completion when tapped twice", async () => {
    let releaseStatus: (() => void) | undefined;
    const updateStatus = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseStatus = resolve;
        }),
    );
    const archiveRow = vi.fn(async () => undefined);
    const args = {
      issueId: "issue-1",
      updateStatus,
      listRows: () => [inboxItem({ id: "a" })],
      archiveRow,
    };

    const first = completeInboxIssue(args);
    const second = completeInboxIssue(args);
    await expect(second).resolves.toBeNull();
    expect(updateStatus).toHaveBeenCalledTimes(1);

    releaseStatus?.();
    await expect(first).resolves.toEqual({
      statusUpdated: true,
      archivedIds: ["a"],
      archiveError: null,
    });
  });
});

describe("archiveInboxIssueRows", () => {
  it("retries only the rows still unarchived", async () => {
    const archived: string[] = [];
    const result = await archiveInboxIssueRows({
      issueId: "issue-1",
      listRows: () => [
        inboxItem({ id: "already", archived: true }),
        inboxItem({ id: "remaining" }),
      ],
      archiveRow: async (id) => {
        archived.push(id);
      },
    });

    expect(archived).toEqual(["remaining"]);
    expect(result).toEqual({ archivedIds: ["remaining"], archiveError: null });
  });
});
