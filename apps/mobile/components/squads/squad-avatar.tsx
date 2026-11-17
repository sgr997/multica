/**
 * Squad identity marks.
 *
 * `SquadAvatar` renders the uploaded avatar, an emoji avatar, or a single
 * character from the name in a soft square. Detail headers are 56pt, so the
 * fallback must stay on one line — taking two initials from a name like
 * "Multica 维护" used to wrap into "M / 维".
 *
 * `SquadAvatarStack` prefers the list payload's member_preview so a squad
 * reads as a group at a glance. It caps at two 32pt avatars plus a `+N`
 * circle, and lays them out with absolute offsets instead of negative
 * margins so row edges are never clipped.
 */
import { Image, View } from "react-native";
import type { Squad } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { cn } from "@/lib/utils";
import type { SquadStatusSummary } from "@/lib/squads";
import { useT } from "@/lib/i18n";

const SIZES = {
  sm: 32,
  md: 40,
  lg: 56,
} as const;

const INITIAL_FONT_SIZE: Record<keyof typeof SIZES, number> = {
  sm: 13,
  md: 16,
  lg: 22,
};

const RADIUS: Record<keyof typeof SIZES, number> = {
  sm: 10,
  md: 10,
  lg: 16,
};

/**
 * One-character fallback: Latin names keep the first letter upper-cased,
 * CJK names keep the first character. Emoji-only names pass through.
 */
export function squadInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = Array.from(trimmed)[0] ?? "?";
  const code = first.codePointAt(0) ?? 0;
  const isCjk =
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff);
  return isCjk ? first : first.toLocaleUpperCase();
}

export function SquadAvatar({
  squad,
  size = "md",
}: {
  squad: Pick<Squad, "name" | "avatar_url">;
  size?: keyof typeof SIZES;
}) {
  const px = SIZES[size];
  const radius = RADIUS[size];
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
        numberOfLines={1}
        className="font-semibold text-secondary-foreground"
        style={{ fontSize: INITIAL_FONT_SIZE[size], lineHeight: px }}
      >
        {squadInitial(squad.name)}
      </Text>
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
 * Neutral status marker: a small colored dot plus 12pt muted text. Replaces
 * the tinted pill so the row's right edge reads as one quiet column.
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
      <Text className="text-[12px] text-muted-foreground">
        {label ?? t(`status.${status}`)}
      </Text>
    </View>
  );
}
