import { beforeEach, describe, expect, it } from "vitest";
import { useIssueSelectionStore } from "./issue-selection-store";

describe("issue selection store", () => {
  beforeEach(() => {
    useIssueSelectionStore.setState({
      selections: {},
      pending: {},
      feedback: {},
    });
  });

  it("clears every surface when leaving the tab", () => {
    useIssueSelectionStore.getState().setSelection("my-issues", ["a"]);
    useIssueSelectionStore.getState().setSelection("project:p-1", ["b"]);
    useIssueSelectionStore.getState().clearAll();
    expect(useIssueSelectionStore.getState().selections).toEqual({});
  });

  it("retains selected ids that are still visible", () => {
    const store = useIssueSelectionStore.getState();
    store.setSelection("my-issues", ["a", "b", "c"]);
    useIssueSelectionStore.getState().retainVisible("my-issues", ["c", "a"]);
    expect(
      useIssueSelectionStore.getState().selections["my-issues"],
    ).toEqual(["a", "c"]);
  });

  it("selects all currently loaded rows", () => {
    useIssueSelectionStore.getState().selectAll("my-issues", ["a", "b"]);
    expect(
      useIssueSelectionStore.getState().selections["my-issues"],
    ).toEqual(["a", "b"]);
  });

  it("clears the selection when leaving the surface", () => {
    useIssueSelectionStore.getState().setSelection("my-issues", ["a"]);
    useIssueSelectionStore.getState().clear("my-issues");
    expect(
      useIssueSelectionStore.getState().selections["my-issues"],
    ).toEqual([]);
  });

  it("activates one surface at a time", () => {
    useIssueSelectionStore.getState().setSelection("my-issues", ["a"]);
    useIssueSelectionStore.getState().setSelection("project:p-1", ["b"]);
    useIssueSelectionStore.getState().activate("project:p-1");
    expect(Object.keys(useIssueSelectionStore.getState().selections)).toEqual([
      "project:p-1",
    ]);
  });
});
