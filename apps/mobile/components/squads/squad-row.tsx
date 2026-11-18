/**
 * One row in the Squads segment.
 *
 * Layout is deliberately flat: 32pt avatar group, a two-line identity block,
 * a neutral dot + text status, and a chevron. No pill in the trailing slot —
 * the previous tinted capsule floated free of the row's baseline.
 */
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Squad } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import {
  SquadAvatarStack,
  SquadStatusLabel,
  type SquadStatusValue,
} from "@/components/squads/squad-avatar";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useT } from "@/lib/i18n";

interface Props {
  squad: Squad;
  leaderName: string | null;
  status: SquadStatusValue;
  /** Running tasks for the leader; only meaningful while working. */
  workingTaskCount?: number;
  /** Runtime machine label shown on a working row. */
  runtimeName?: string | null;
  onPress: () => void;
}

export function SquadRow({
  squad,
  leaderName,
  status,
  workingTaskCount = 0,
  runtimeName = null,
  onPress,
}: Props) {
  const { t } = useT("squads");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
  const memberCount = squad.member_count ?? 0;
  const showWork = status === "working" && !squad.archived_at;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={squad.name}
      className="min-h-16 flex-row items-center gap-3 px-4 py-2 active:bg-secondary"
    >
      <SquadAvatarStack squad={squad} size={32} />
      <View className="min-w-0 flex-1 justify-center">
        <View className="flex-row items-center gap-1.5">
          <Text
            className="shrink text-[17px] font-semibold text-foreground"
            numberOfLines={1}
          >
            {squad.name}
          </Text>
          {squad.archived_at ? (
            <View className="rounded-full bg-muted px-1.5 py-0.5">
              <Text className="text-[11px] text-muted-foreground">
                {t("list.archived")}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          className="mt-0.5 text-[13px] text-muted-foreground"
          numberOfLines={1}
        >
          {t("list.member_count", { count: memberCount })}
          {leaderName
            ? ` · 👑 ${leaderName}`
            : ` · ${t("list.no_leader")}`}
        </Text>
        {showWork ? (
          <Text
            className="mt-0.5 text-xs text-muted-foreground"
            numberOfLines={1}
          >
            {t("list.working_tasks", { count: workingTaskCount })}
            {runtimeName ? ` · ${runtimeName}` : ""}
          </Text>
        ) : null}
      </View>
      <SquadStatusLabel status={status} />
      <Ionicons
        name="chevron-forward"
        size={16}
        color={theme.mutedForeground}
      />
    </Pressable>
  );
}
