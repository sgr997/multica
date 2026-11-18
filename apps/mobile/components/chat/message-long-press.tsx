/**
 * Long-press handler for a chat message bubble. Exposes `onLongPress`
 * (drives a native iOS ActionSheetIOS) and `isPressed` (drives the
 * caller's highlight ring while the sheet is on screen).
 *
 * iOS-native first per apps/mobile/CLAUDE.md §UI components → waterfall
 * step 1: `ActionSheetIOS.showActionSheetWithOptions`. Zero custom
 * layout, zero animation, zero overflow math, zero new deps.
 *
 * Item set (v1, conditional):
 *   Copy · Select Text · Cancel
 *
 * Copy puts *plain text* on the clipboard (not the raw markdown a message is
 * stored as) and confirms with the app toast. Select Text opens the shared
 * selection sheet (`components/system/text-selection-sheet.tsx`) instead of
 * flipping the bubble into an in-place selection mode.
 *
 * Mirrors `useCommentLongPress` in `components/issue/comment-context-
 * menu.tsx` — kept as a sibling rather than a shared primitive because
 * we have only 2 callers (chat + comments), below the "3 callers + no
 * native alternative" threshold in apps/mobile/CLAUDE.md.
 */
import { useCallback, useState } from "react";
import { ActionSheetIOS } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import type { ChatMessage } from "@multica/core/types";
import { useAppToastStore } from "@/data/app-toast-store";
import { useTextSelectionStore } from "@/data/text-selection-store";
import { useT } from "@/lib/i18n";
import { markdownToPlainText } from "@/lib/markdown/plain-text";

export function useChatMessageLongPress(
  message: ChatMessage,
): { onLongPress: () => void; isPressed: boolean } {
  const [isPressed, setIsPressed] = useState(false);
  const { t } = useT("issues");
  const { t: tCommon } = useT("common");

  const onLongPress = useCallback(() => {
    const plainText = markdownToPlainText(message.content ?? "");
    const hasContent = plainText.length > 0;

    Haptics.selectionAsync().catch(() => {});
    setIsPressed(true);

    type Action =
      | { kind: "copy" }
      | { kind: "select" }
      | { kind: "cancel" };

    const options: string[] = [];
    const actions: Action[] = [];
    const push = (label: string, action: Action) => {
      options.push(label);
      actions.push(action);
    };

    if (hasContent) {
      push(t("comments.copy"), { kind: "copy" });
      push(t("comments.select_text"), { kind: "select" });
    }
    push(tCommon("actions.cancel"), { kind: "cancel" });

    const cancelButtonIndex = options.length - 1;

    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex },
      (i) => {
        setIsPressed(false);
        const action = actions[i];
        if (!action || action.kind === "cancel") return;

        switch (action.kind) {
          case "copy":
            if (plainText) {
              void Clipboard.setStringAsync(plainText);
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              ).catch(() => {});
              useAppToastStore.getState().show(tCommon("errors.copied"));
            }
            return;
          case "select":
            useTextSelectionStore.getState().open(plainText);
            return;
        }
      },
    );
  }, [message.content, t, tCommon]);

  return { onLongPress, isPressed };
}
