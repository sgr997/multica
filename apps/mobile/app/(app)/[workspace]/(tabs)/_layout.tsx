/**
 * Bottom tab bar — JS `<Tabs>` from expo-router (react-navigation under the
 * hood). We tried NativeTabs first but its `canPreventDefault: false`
 * constraint makes "tap More → open something" impossible. JS Tabs
 * supports `listeners.tabPress + e.preventDefault()`, the canonical RN
 * pattern for tab-as-action.
 *
 * The "More" tab is **not a navigation target** — its press opens a
 * DropdownMenu popover anchored above the tab. The popover is rendered
 * by `<MoreTabDropdownAnchor />` as a sibling of `<Tabs>`, NOT as a
 * `tabBarButton` replacement: keeping the real tab button intact means
 * the icon + "More" label render identically to the other tabs.
 * We just open the dropdown imperatively from `listeners.tabPress` via
 * the exposed `TriggerRef.open()`.
 *
 * The stub (tabs)/more.tsx file still exists only because expo-router
 * requires every Tabs.Screen to have a backing route file — the press
 * is preventDefault'd so we never actually navigate to it.
 *
 * Active / inactive tint colors are derived from the current colour
 * scheme via THEME so dark mode picks contrasting values automatically.
 *
 * Tab order and iconography live in `lib/tab-config.ts`; this file only
 * supplies the runtime bindings (badges, the More popover trigger). Screens
 * stay mounted when the user switches tabs (React Navigation's `lazy`
 * mounts on first visit and never unmounts), so list scroll position and
 * filter state survive tab switches without a refetch.
 */
import { useRef } from "react";
import { Tabs } from "expo-router";
import { Image } from "expo-image";
import { View } from "react-native";
import type { TriggerRef } from "@rn-primitives/dropdown-menu";
import { useWorkspaceStore } from "@/data/workspace-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import {
  useInboxUnreadCount,
  useChatUnreadMessageCount,
} from "@/lib/unread-counts";
import { MoreTabDropdownAnchor } from "@/components/nav/more-tab-dropdown";
import { useT } from "@/lib/i18n";
import { TABS } from "@/lib/tab-config";

// Only override backgroundColor — @react-navigation/elements Badge internally
// sets borderRadius = size/2, height = size, minWidth = size, so a single
// character renders as a perfect circle. Overriding minWidth/fontSize here
// breaks that geometry. Text color is auto-derived from backgroundColor
// luminance by Badge itself (white on brand blue).
const BADGE_STYLE = {
  backgroundColor: THEME.light.brand,
};

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const { t } = useT("navigation");

  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const inboxUnread = useInboxUnreadCount(wsId);
  const chatUnread = useChatUnreadMessageCount(wsId);

  // Truncation aligned with web's sidebar badges: 99+ for both. `undefined`
  // makes React Navigation hide the badge, so zero-count is a free no-op.
  const inboxBadge =
    inboxUnread > 0 ? (inboxUnread > 99 ? "99+" : String(inboxUnread)) : undefined;
  const chatBadge =
    chatUnread > 0 ? (chatUnread > 99 ? "99+" : String(chatUnread)) : undefined;

  // Imperative handle into the More tab's dropdown — listeners.tabPress
  // calls .open(); the @rn-primitives Trigger measures itself inside
  // open() so the popover anchors to MoreTabDropdownAnchor's rect.
  const moreTriggerRef = useRef<TriggerRef>(null);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          // UIKit tab bars ignore Dynamic Type for their labels; be explicit
          // on every platform so a five-item bar cannot truncate at the
          // largest accessibility sizes.
          tabBarAllowFontScaling: false,
          lazy: true,
          tabBarActiveTintColor: theme.foreground,
          tabBarInactiveTintColor: theme.mutedForeground,
          tabBarStyle: { backgroundColor: theme.background },
          tabBarLabelStyle: { fontSize: 11 },
        }}
      >
        {TABS.map((tab) => {
          const badge =
            tab.badge === "inbox"
              ? inboxBadge
              : tab.badge === "chat"
                ? chatBadge
                : undefined;
          return (
            <Tabs.Screen
              key={tab.route}
              name={tab.route}
              options={{
                title: t(tab.labelKey),
                tabBarBadge: badge,
                tabBarBadgeStyle: tab.badge ? BADGE_STYLE : undefined,
                tabBarIcon: ({ color, size, focused }) => (
                  <Image
                    source={`sf:${focused ? tab.icon.active : tab.icon.inactive}`}
                    style={{ width: size, height: size, color }}
                  />
                ),
              }}
              listeners={
                tab.route === "more"
                  ? () => ({
                      tabPress: (e) => {
                        // Don't navigate to the (stub) /more screen — open the
                        // dropdown popover instead. The trigger is invisible
                        // and mounted in MoreTabDropdownAnchor below;
                        // ref.open() also measures its rect so the popover
                        // anchors correctly.
                        e.preventDefault();
                        moreTriggerRef.current?.open();
                      },
                    })
                  : undefined
              }
            />
          );
        })}
      </Tabs>

      <MoreTabDropdownAnchor triggerRef={moreTriggerRef} />
    </View>
  );
}
