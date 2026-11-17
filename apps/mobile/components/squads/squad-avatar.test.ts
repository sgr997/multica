// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { squadInitial, squadStatusDotClass } from "@/components/squads/squad-avatar";

vi.mock("react-native", () => ({ Image: "Image", View: "View" }));
vi.mock("@/components/ui/text", () => ({ Text: "Text" }));
vi.mock("@/components/ui/actor-avatar", () => ({ ActorAvatar: "ActorAvatar" }));
vi.mock("@/lib/i18n", () => ({
  useT: () => ({ t: (key: string) => key }),
}));

describe("squadInitial", () => {
  it("takes one Latin letter and upper-cases it", () => {
    expect(squadInitial("multica")).toBe("M");
    expect(squadInitial("  mika  ")).toBe("M");
  });

  it("takes the first CJK character instead of splitting on spaces", () => {
    expect(squadInitial("Multica 维护")).toBe("M");
    expect(squadInitial("服务运维")).toBe("服");
    expect(squadInitial("智慧體")).toBe("智");
  });

  it("falls back to a placeholder for an empty name", () => {
    expect(squadInitial("   ")).toBe("?");
  });
});

describe("squadStatusDotClass", () => {
  it("uses theme tokens, not the old tinted pill colors", () => {
    expect(squadStatusDotClass("working")).toBe("bg-success");
    expect(squadStatusDotClass("idle")).toBe("bg-info");
    expect(squadStatusDotClass("unstable")).toBe("bg-warning");
    expect(squadStatusDotClass("offline")).toBe("bg-muted-foreground/40");
    expect(squadStatusDotClass("archived")).toBe("bg-muted-foreground/40");
  });
});
