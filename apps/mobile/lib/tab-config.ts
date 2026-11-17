/**
 * Bottom-tab order and iconography.
 *
 * Kept as data (rather than inline `<Tabs.Screen>` calls) so the tab order,
 * labels and route files can be asserted without rendering React Native.
 * `(tabs)/_layout.tsx` renders this list in order; expo-router resolves each
 * `route` to `app/(app)/[workspace]/(tabs)/<route>.tsx`.
 *
 * Icons are SF Symbols rendered through expo-image (`sf:` sources), matching
 * the rest of the mobile chrome. The selected/unselected pair must stay in
 * sync with the icon used by the same feature elsewhere (e.g. the More menu
 * used `person.2` for Agents before Agents became a first-class tab).
 */

export const TAB_ROUTES = [
  "inbox",
  "my-issues",
  "chat",
  "agents",
  "more",
] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];

export interface TabIcon {
  active: string;
  inactive: string;
}

export interface TabDefinition {
  route: TabRoute;
  labelKey: `tabs.${string}`;
  icon: TabIcon;
  badge?: "inbox" | "chat";
}

export const TABS: readonly TabDefinition[] = [
  {
    route: "inbox",
    labelKey: "tabs.inbox",
    icon: { active: "tray.fill", inactive: "tray" },
    badge: "inbox",
  },
  {
    route: "my-issues",
    labelKey: "tabs.my_issues",
    icon: { active: "checklist", inactive: "checklist.unchecked" },
  },
  {
    route: "chat",
    labelKey: "tabs.chat",
    icon: { active: "bubble.left.fill", inactive: "bubble.left" },
    badge: "chat",
  },
  {
    route: "agents",
    labelKey: "tabs.agents",
    icon: { active: "person.2.fill", inactive: "person.2" },
  },
  {
    route: "more",
    labelKey: "tabs.more",
    icon: { active: "ellipsis", inactive: "ellipsis" },
  },
];

export const TAB_COUNT = TABS.length;

/** Width share of one tab in the bottom bar, used to anchor the More menu. */
export const TAB_BAR_ITEM_WIDTH_PERCENT = 100 / TAB_COUNT;
