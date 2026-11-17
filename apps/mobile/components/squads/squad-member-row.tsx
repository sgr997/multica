/**
 * Roster row on squad detail.
 *
 * Every member renders the same two lines:
 *   1. 36pt avatar, name, leader crown, and a fixed-width trailing slot for
 *      the `...` menu (reserved even when the member has no actions).
 *   2. role pill on the left, dot + status on the right, sharing a baseline.
 *
 * A working member gets an optional third line linking to the active issue;
 * it never replaces the role/status line, so the roster stays aligned.
 */
import { Pressable, View } from "react-native";
import type { SquadMember, SquadMemberStatusValue } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { IconButton } from "@/components/ui/icon-button";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import {
  SquadStatusLabel,
  type SquadStatusValue,
} from "@/components/squads/squad-avatar";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export interface SquadMemberIssue {
  identifier: string;
  title: string;
  extra: number;
}

interface Props {
  member: SquadMember;
  name: string;
  isLeader: boolean;
  roleLabel: string;
  status: SquadMemberStatusValue | null | undefined;
  canManage: boolean;
  onMenu?: () => void;
  onPressRole?: () => void;
  activeIssue?: SquadMemberIssue | null;
  onPressIssue?: () => void;
}

const STATUS_VALUES = new Set<SquadStatusValue>([
  "working",
  "idle",
  "offline",
  "unstable",
  "archived",
]);

function statusValue(
  status: SquadMemberStatusValue | null | undefined,
): SquadStatusValue | null {
  return status && STATUS_VALUES.has(status as SquadStatusValue)
    ? (status as SquadStatusValue)
    : null;
}

export function SquadMemberRow({
  member,
  name,
  isLeader,
  roleLabel,
  status,
  canManage,
  onMenu,
  onPressRole,
  activeIssue,
  onPressIssue,
}: Props) {
  const { t } = useT("squads");
  const editableRole = canManage && !!onPressRole;
  const showMenu = canManage && !!onMenu;

  return (
    <View className="px-4 py-3">
      <View className="flex-row items-center gap-3">
        <ActorAvatar
          type={member.member_type}
          id={member.member_id}
          size={36}
          showPresence={member.member_type === "agent"}
        />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              className="shrink text-[15px] font-semibold text-foreground"
              numberOfLines={1}
            >
              {name}
            </Text>
            {isLeader ? <Text className="text-[13px]">👑</Text> : null}
            <View className="flex-1" />
            {showMenu ? (
              <IconButton
                name="ellipsis-horizontal"
                iconSize={18}
                onPress={onMenu}
                accessibilityLabel={t("detail.member_menu", { name })}
                className="h-9 w-9"
              />
            ) : (
              <View className="h-9 w-9" />
            )}
          </View>

          <View className="mt-1 flex-row items-center gap-2">
            {roleLabel ? (
              <Pressable
                disabled={!editableRole}
                onPress={onPressRole}
                accessibilityRole={editableRole ? "button" : undefined}
                accessibilityLabel={
                  editableRole
                    ? t("detail.role_edit_title", { name })
                    : undefined
                }
                className={cn(
                  "shrink rounded-full bg-muted px-2 py-0.5",
                  editableRole && "active:bg-border",
                )}
              >
                <Text
                  className="text-[12px] text-muted-foreground"
                  numberOfLines={1}
                >
                  {roleLabel}
                </Text>
              </Pressable>
            ) : null}
            <View className="flex-1" />
            <SquadStatusLabel status={statusValue(status)} />
          </View>
        </View>
      </View>

      {activeIssue ? (
        <Pressable
          onPress={onPressIssue}
          disabled={!onPressIssue}
          className="mt-2 flex-row items-center gap-1 pl-12 active:opacity-60"
        >
          <Text className="text-[12px] text-brand" numberOfLines={1}>
            {t("detail.working_on")} · {activeIssue.identifier}{" "}
            {activeIssue.title}
          </Text>
          {activeIssue.extra > 0 ? (
            <Text className="text-[12px] text-muted-foreground">
              {t("detail.and_more", { count: activeIssue.extra })}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/** Leader rows always show the localized "owner" label instead of the raw
 *  stored role; everyone else keeps the free-text role. */
export function squadMemberRoleLabel(
  isLeader: boolean,
  role: string,
  leaderLabel: string,
  emptyLabel: string,
): string {
  if (isLeader) return leaderLabel;
  return role.trim() || emptyLabel;
}
