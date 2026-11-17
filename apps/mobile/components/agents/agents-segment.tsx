/**
 * Agents / Squads segment.
 *
 * The native UISegmentedControl renders its selected capsule with a slightly
 * taller thumb than the track on iOS 26; at this width that read as a white
 * pill spilling out of the gray track. Drawing the two layers here pins the
 * capsule to a 2pt inset on every side and clips the shadow to the track, so
 * the edges line up exactly at any Dynamic Type size.
 */
import { Pressable, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { AgentsTabSegment } from "@/data/stores/agents-tab-store";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const TRACK_HEIGHT = 32;
const TRACK_INSET = 2;
const TRACK_WIDTH = 176;

export function AgentsSegment({
  value,
  onChange,
}: {
  value: AgentsTabSegment;
  onChange: (value: AgentsTabSegment) => void;
}) {
  const { t } = useT("squads");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const options: { value: AgentsTabSegment; label: string }[] = [
    { value: "agents", label: t("tab.agents") },
    { value: "squads", label: t("tab.squads") },
  ];

  return (
    <View
      className="flex-row overflow-hidden bg-secondary"
      style={{
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        borderRadius: 9,
        padding: TRACK_INSET,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className="flex-1 items-center justify-center"
            style={[
              {
                borderRadius: 7,
                backgroundColor: selected ? theme.background : "transparent",
              },
              selected
                ? {
                    shadowColor: "#000",
                    shadowOpacity: 0.14,
                    shadowRadius: 2,
                    shadowOffset: { width: 0, height: 1 },
                  }
                : null,
            ]}
          >
            <Text
              numberOfLines={1}
              className={
                selected
                  ? "text-[13px] font-semibold text-foreground"
                  : "text-[13px] text-muted-foreground"
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
