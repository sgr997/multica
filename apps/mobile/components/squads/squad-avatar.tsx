/**
 * Squad identity marks.
 *
 * `SquadAvatar` renders the uploaded avatar, an emoji avatar, or a neutral
 * squad glyph on a tinted square. Names never stand in for art: a lone "M"
 * in a gray box reads as a broken image, while the glyph reads as "this squad
 * has no custom icon yet".
 *
 * `SquadAvatarStack` prefers the list payload's member_preview so a squad
 * reads as a group at a glance. It caps at two 32pt avatars plus a `+N`
 * circle, and lays them out with absolute offsets instead of negative
 * margins so row edges are never clipped.
 */
import { Image, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Squad } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { cn } from "@/lib/utils";
import type { SquadStatusSummary } from "@/lib/squads";
import { useColorScheme } from "@/lib/use-color-scheme";
import { THEME } from "@/lib/theme";
import { useT } from "@/lib/i18n";

const SIZES = {
  sm: 32,
  md: 40,
  lg: 56,
} as const;

const RADIUS: Record<keyof typeof SIZES, number> = {
  sm: 10,
  md: 10,
  lg: 16,
};

export function SquadAvatar({
  squad,
  size = "md",
}: {
  squad: Pick<Squad, "name" | "avatar_url">;
  size?: keyof typeof SIZES;
}) {
  const px = SIZES[size];
  const radius = RADIUS[size];
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme];
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
      accessible
      accessibilityLabel={squad.name}
      className="items-center justify-center bg-brand/10"
      style={{ width: px, height: px, borderRadius: radius }}
    >
      <Ionicons
        name="people"
        size={Math.round(px * 0.54)}
        color={theme.brand}
      />
    </View>
  );
}

const STACK_MAX = 2;
const STACK_OVERLAP = 8;
const STACK_RING = 4;

interface PreviewMember {
  member_type: string;
  member_id: string;
}

function dedupePreview(preview: readonly PreviewMember[]): PreviewMember[] {
  const seen = new Set<string>();
  const out: PreviewMember[] = [];
  for (const member of preview) {
    const key = `${member.member_type}:${member.member_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(member);
  }
  return out;
}

export function SquadAvatarStack({
  squad,
  size = 32,
}: {
  squad: Squad;
  size?: number;
}) {
  const preview = dedupePreview(squad.member_preview ?? []);
  if (preview.length === 0) {
    return <SquadAvatar squad={squad} size="sm" />;
  }

  const visible = preview.slice(0, STACK_MAX);
  const overflow = preview.length - visible.length;
  const step = size - STACK_OVERLAP;
  const count = visible.length + (overflow > 0 ? 1 : 0);
  const ring = size + STACK_RING;
  const width = (count - 1) * step + ring;

  return (
    <View style={{ width, height: ring }} className="flex-row">
      {visible.map((member, index) => (
        <View
          key={`${member.member_type}:${member.member_id}`}
          className="absolute items-center justify-center rounded-full bg-background"
          style={{
            left: index * step,
            top: 0,
            width: ring,
            height: ring,
          }}
        >
          <ActorAvatar
            type={member.member_type === "member" ? "member" : "agent"}
            id={member.member_id}
            size={size}
          />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          className="absolute items-center justify-center rounded-full bg-muted"
          style={{
            left: visible.length * step,
            top: 0,
            width: ring,
            height: ring,
          }}
        >
          <Text className="text-[11px] font-medium text-muted-foreground">
            +{overflow}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export type SquadStatusValue = SquadStatusSummary | "archived";

const STATUS_DOT_CLASS: Record<SquadStatusValue, string> = {
  working: "bg-success",
  idle: "bg-info",
  unstable: "bg-warning",
  offline: "bg-muted-foreground/40",
  archived: "bg-muted-foreground/40",
};

export function squadStatusDotClass(status: SquadStatusValue): string {
  return STATUS_DOT_CLASS[status];
}

/**
 * Text colour that belongs with the dot above. Working/idle/unstable use the
 * darker `*-foreground` companions of the status tokens so the label keeps a
 * readable contrast on both themes; offline stays neutral but darker than the
 * old 12pt muted label.
 */
const STATUS_TEXT_CLASS: Record<SquadStatusValue, string> = {
  working: "text-success-foreground",
  idle: "text-info-foreground",
  unstable: "text-warning-foreground",
  offline: "text-foreground/70",
  archived: "text-foreground/70",
};

export function squadStatusTextClass(status: SquadStatusValue): string {
  return STATUS_TEXT_CLASS[status];
}

/**
 * Status marker: a small colored dot plus a same-hue 13pt label. The dot and
 * the text always change together, so "green dot + gray text" can no longer
 * sit next to "blue dot + blue text" in the same roster.
 */
export function SquadStatusLabel({
  status,
  label,
  className,
}: {
  status: SquadStatusValue | null | undefined;
  /** Pre-resolved label; defaults to the localized status string. */
  label?: string | null;
  className?: string;
}) {
  const { t } = useT("squads");
  if (!status) return null;
  return (
    <View className={cn("shrink-0 flex-row items-center gap-1.5", className)}>
      <View
        className={cn("size-1.5 rounded-full", squadStatusDotClass(status))}
      />
      <Text className={cn("text-[13px]", squadStatusTextClass(status))}>
        {label ?? t(`status.${status}`)}
      </Text>
    </View>
  );
}
