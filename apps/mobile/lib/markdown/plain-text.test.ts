import { describe, expect, it } from "vitest";
import { markdownToPlainText } from "./plain-text";

describe("markdownToPlainText", () => {
  it("keeps prose and drops emphasis markers", () => {
    expect(markdownToPlainText("**bold** and *italic* and `code`")).toBe(
      "bold and italic and code",
    );
  });

  it("keeps mention and link labels instead of raw syntax", () => {
    expect(
      markdownToPlainText(
        "see [MUL-123](mention://issue/abc) and [docs](https://example.com)",
      ),
    ).toBe("see MUL-123 and docs");
  });

  it("keeps code block contents without the fences", () => {
    expect(markdownToPlainText("```ts\nconst a = 1;\n```")).toBe(
      "const a = 1;",
    );
  });

  it("turns headings, quotes and lists into readable lines", () => {
    expect(markdownToPlainText("## Plan\n> quote\n- one\n- two")).toBe(
      "Plan\nquote\n• one\n• two",
    );
  });

  it("drops task-list checkboxes but keeps the item", () => {
    expect(markdownToPlainText("- [x] shipped\n- [ ] pending")).toBe(
      "shipped\npending",
    );
  });

  it("uses the image alt text or its url", () => {
    expect(markdownToPlainText("![shot](https://x/y.png)")).toBe("shot");
    expect(markdownToPlainText("![](https://x/y.png)")).toBe(
      "https://x/y.png",
    );
  });

  it("collapses blank-line runs and trims", () => {
    expect(markdownToPlainText("\n\na\n\n\n\nb\n")).toBe("a\n\nb");
  });
});
