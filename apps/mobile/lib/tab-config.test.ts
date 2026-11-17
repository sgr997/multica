// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MORE_MENU_ITEMS } from "./more-menu";
import { TAB_COUNT, TAB_ROUTES, TABS } from "./tab-config";

const MOBILE_ROOT = path.resolve(__dirname, "..");
const TABS_DIR = path.join(MOBILE_ROOT, "app/(app)/[workspace]/(tabs)");
const LEGACY_AGENTS_ROUTE = path.join(
  MOBILE_ROOT,
  "app/(app)/[workspace]/more/agents.tsx",
);

function readNavigation(locale: string): {
  tabs: Record<string, string>;
  more_menu: Record<string, string>;
} {
  return JSON.parse(
    fs.readFileSync(
      path.join(MOBILE_ROOT, "locales", locale, "navigation.json"),
      "utf8",
    ),
  );
}

describe("bottom tab configuration", () => {
  it("keeps the five primary tabs in product order", () => {
    expect(TAB_ROUTES).toEqual([
      "inbox",
      "my-issues",
      "chat",
      "agents",
      "more",
    ]);
    expect(TABS.map((tab) => tab.route)).toEqual(TAB_ROUTES);
    expect(TAB_COUNT).toBe(5);
  });

  it("gives every tab a backing expo-router route file", () => {
    for (const route of TAB_ROUTES) {
      expect(
        fs.existsSync(path.join(TABS_DIR, `${route}.tsx`)),
        `missing (tabs)/${route}.tsx`,
      ).toBe(true);
    }
  });

  it("uses person.2 / person.2.fill for the Agents tab", () => {
    const agents = TABS.find((tab) => tab.route === "agents");
    expect(agents?.icon).toEqual({
      active: "person.2.fill",
      inactive: "person.2",
    });
  });

  it("keeps Agents out of the More menu", () => {
    expect(MORE_MENU_ITEMS.some((item) => item.path === "/more/agents")).toBe(
      false,
    );
    expect(
      MORE_MENU_ITEMS.some(
        (item) => (item.labelKey as string) === "more_menu.agents",
      ),
    ).toBe(false);
  });

  it("redirects the legacy /more/agents deep link to the tab", () => {
    const source = fs.readFileSync(LEGACY_AGENTS_ROUTE, "utf8");
    expect(source).toContain("Redirect");
    expect(source).toContain("/agents");
    expect(source).not.toContain("SectionList");
  });

  it("has a tab label in every locale and no duplicate More label", () => {
    for (const locale of ["en", "zh-Hans", "zh-Hant"]) {
      const navigation = readNavigation(locale);
      for (const tab of TABS) {
        const key = tab.labelKey.replace(/^tabs\./, "");
        expect(
          navigation.tabs[key],
          `missing ${locale} navigation:tabs.${key}`,
        ).toBeTruthy();
      }
      expect(navigation.more_menu.agents).toBeUndefined();
    }
  });
});
