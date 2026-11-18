/**
 * One-line health summary above the collaboration list.
 *
 * The runtime counter is optional on purpose: when the runtime query fails,
 * agents are still perfectly readable and the right-hand figure would be a
 * lie ("0/0 online"), so the caller passes null and the row degrades to the
 * agent counts only.
 */
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import type { AgentListSummary } from "@/lib/agent-list";
import { useT } from "@/lib/i18n";

export function CollaborationSummaryRow({
  summary,
  runtimes,
}: {
  summary: AgentListSummary;
  runtimes: { online: number; total: number } | null;
}) {
  const { t } = useT("agents");

  return (
    <View className="flex-row items-center justify-between gap-3 px-4 pb-1 pt-1">
      <Text className="shrink text-xs text-muted-foreground" numberOfLines={1}>
        {t("list.summary", {
          live: summary.live,
          working: summary.working,
          attention: summary.attention,
        })}
      </Text>
      {runtimes ? (
        <Text
          className="shrink-0 text-xs text-muted-foreground"
          numberOfLines={1}
          accessibilityLabel={t("list.runtimes_online", {
            online: runtimes.online,
            total: runtimes.total,
          })}
        >
          {t("list.runtimes_online", {
            online: runtimes.online,
            total: runtimes.total,
          })}
        </Text>
      ) : null}
    </View>
  );
}
