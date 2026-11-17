/**
 * Entries inside the More tab's popover.
 *
 * Agents deliberately live here only as the `person.2` tab in the bottom
 * bar — a duplicate entry under More would give the same feature two entry
 * points. The `/more/agents` route still exists as a redirect for old deep
 * links, but it is no longer a menu item.
 */

export type MoreMenuLabelKey =
  | "more_menu.pinned"
  | "more_menu.issues"
  | "more_menu.projects";

export interface MoreMenuItem {
  labelKey: MoreMenuLabelKey;
  /** SF Symbol name, rendered via expo-image `source: "sf:<name>"`. */
  icon: string;
  /** Path under /:slug/ — final href is `/${slug}${path}`. */
  path: string;
}

export const MORE_MENU_ITEMS: readonly MoreMenuItem[] = [
  { labelKey: "more_menu.pinned", icon: "pin", path: "/more/pins" },
  { labelKey: "more_menu.issues", icon: "list.bullet", path: "/more/issues" },
  {
    labelKey: "more_menu.projects",
    icon: "square.stack",
    path: "/more/projects",
  },
];
