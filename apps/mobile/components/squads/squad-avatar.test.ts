// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  squadStatusDotClass,
  squadStatusTextClass,
} from "@/components/squads/squad-avatar";

vi.mock("react-native", () => ({ Image: "Image", View: "View" }));
vi.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));
vi.mock("@/components/ui/text", () => ({ Text: "Text" }));
vi.mock("@/components/ui/actor-avatar", () => ({ ActorAvatar: "ActorAvatar" }));
vi.mock("@/lib/use-color-scheme", () => ({
  useColorScheme: () => ({ colorScheme: "light" }),
}));
vi.mock("@/lib/theme", () => ({
  THEME: {
    light: { brand: "#3150d8" },
    dark: { brand: "#3150d8" },
  },
}));
vi.mock("@/lib/i18n", () => ({
  useT: () => ({ t: (key: string) => key }),
}));

describe("squadStatusDotClass", () => {
  it("uses theme tokens, not the old tinted pill colors", () => {
    expect(squadStatusDotClass("working")).toBe("bg-success");
    expect(squadStatusDotClass("idle")).toBe("bg-info");
    expect(squadStatusDotClass("unstable")).toBe("bg-warning");
    expect(squadStatusDotClass("offline")).toBe("bg-muted-foreground/40");
    expect(squadStatusDotClass("archived")).toBe("bg-muted-foreground/40");
  });
});

describe("squadStatusTextClass", () => {
  it("pairs every dot with a same-hue, readable text token", () => {
    expect(squadStatusTextClass("working")).toBe("text-success-foreground");
    expect(squadStatusTextClass("idle")).toBe("text-info-foreground");
    expect(squadStatusTextClass("unstable")).toBe("text-warning-foreground");
    expect(squadStatusTextClass("offline")).toBe("text-foreground/70");
    expect(squadStatusTextClass("archived")).toBe("text-foreground/70");
  });
});
