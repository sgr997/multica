/**
 * Squad identity marks.
 *
 * `SquadAvatar` renders the uploaded avatar, an emoji avatar, or the name's
 * initials in a soft square (matching ActorAvatar's squad tile shape).
 * `SquadAvatarStack` prefers the list payload's member_preview so a squad
 * reads as a group at a glance, and falls back to the squad tile when the
 * backend predates member previews.
 */
import { Image, View } from "react-native";
import type { Squad } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { getInitials } from "@/data/use-actor-name";
import { cn } from "@/lib/utils";
import type { SquadStatusSummary } from "@/lib/squads";
import { useT } from "@/lib/i18n";

const SIZES = {
  sm: 32,
  md: 40,
  lg: 56,
} as const;

export function SquadAvatar({
  squad,
  size = "md",
}: {
  squad: Pick<Squad, "name" | "avatar_url">;
  size?: keyof typeof SIZES;
}) {
  const px = SIZES[size];
  const radius = Math.round(px * 0.28);
  const raw = squad.avatar_url;
  const emoji = raw?.startsWith("emoji:")
    ? raw.slice("emoji:".length).trim()
    : null;
  const url =
    !emoji && raw && /^(https?:|data:|file:|asset:)/.test(raw) ? raw : null;

  if (emoji) {
    return (
      <View
        className="items-center justify-center bg-secondary"
        style={{ width: px, height: px, borderRadius: radius }}
      >
        <Text style={{ fontSize: Math.round(px * 0.55), lineHeight: px }}>
          {emoji}
        </Text>
      </View>
    );
  }

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityLabel={squad.name}
        className="bg-muted"
        style={{ width: px, height: px, borderRadius: radius }}
      />
    );
  }

  return (
    <View
      className="items-center justify-center bg-secondary"
      style={{ width: px, height: px, borderRadius: radius }}
    >
      <Text
        className="font-semibold text-secondary-foreground"
        style={{ fontSize: Math.round(px * 0.36) }}
      >
        {getInitials(squad.name)}
      </Text>
    </View>
  );
}

export function SquadAvatarStack({
  squad,
  size = 32,
}: {
  squad: Squad;
  size?: number;
}) {
  const preview = squad.member_preview ?? [];
  if (preview.length === 0) {
    return <SquadAvatar squad={squad} size="sm" />;
  }
  return (
    <AvatarStack
      actors={preview.map((member) => ({
        type: member.member_type === "member" ? "member" : "agent",
        id: member.member_id,
      }))}
      size={size}
    />
  );
}

export function SquadStatusPill({
  status,
  className,
}: {
  status: SquadStatusSummary | "archived" | null | undefined;
  className?: string;
}) {
  const { t } = useT("squads");
  if (!status) return null;
  const label = t(`status.${status}`);
  return (
    <View
      className={cn(
        "shrink-0 rounded-full px-1.5 py-0.5",
        status === "working" && "bg-emerald-500/15",
        status === "idle" && "bg-sky-500/15",
        status === "unstable" && "bg-amber-500/15",
        (status === "offline" || status === "archived") && "bg-muted",
        className,
      )}
    >
      <Text
        className={cn(
          "text-[10px] font-medium",
          status === "working" && "text-emerald-700 dark:text-emerald-400",
          status === "idle" && "text-sky-700 dark:text-sky-400",
          status === "unstable" && "text-amber-700 dark:text-amber-400",
          (status === "offline" || status === "archived") &&
            "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </View>
  );
}
