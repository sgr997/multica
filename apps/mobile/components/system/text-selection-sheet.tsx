/**
 * Reliable surface for copying part of a message.
 *
 * Selection used to happen in place: choose "Select Text" from the long-press
 * sheet, then long-press the bubble a second time and drag UIKit handles
 * inside a markdown renderer that sits in a scroll view. The two gestures
 * raced, the magnifier landed on the wrong line, and scrolling cancelled the
 * mode. This sheet renders the same text in a read-only `TextInput` — a
 * control built for selection — so handles, magnifier, and the system
 * Copy/Look Up menu behave exactly like the rest of iOS.
 */
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Text } from "@/components/ui/text";
import { useAppToastStore } from "@/data/app-toast-store";
import { useTextSelectionStore } from "@/data/text-selection-store";
import { useT } from "@/lib/i18n";

export function TextSelectionSheetHost() {
  const text = useTextSelectionStore((s) => s.text);
  const close = useTextSelectionStore((s) => s.close);
  const { t } = useT("common");
  const insets = useSafeAreaInsets();

  const copyAll = () => {
    if (!text) return;
    void Clipboard.setStringAsync(text);
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
    useAppToastStore.getState().show(t("errors.copied"));
    close();
  };

  return (
    <Modal
      visible={text !== null}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end bg-black/40">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("actions.close")}
          className="flex-1"
          onPress={close}
        />
        <View
          className="bg-background rounded-t-2xl border-t border-border"
          style={{ maxHeight: "78%" }}
        >
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <Text className="text-base font-semibold text-foreground">
              {t("selection.title")}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("actions.close")}
              onPress={close}
              className="min-h-10 min-w-10 items-center justify-center rounded-full active:bg-muted"
            >
              <Text className="text-sm font-medium text-primary">
                {t("actions.close")}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            className="px-5"
            contentContainerStyle={{ paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              value={text ?? ""}
              // Read-only: the field exists for native selection, not edits.
              onChangeText={() => {}}
              multiline
              // Editable so UIKit keeps native selection; the keyboard is
              // suppressed, so the field behaves as read-only text.
              editable
              showSoftInputOnFocus={false}
              contextMenuHidden={false}
              scrollEnabled={false}
              autoCapitalize="none"
              autoCorrect={false}
              textAlignVertical="top"
              accessibilityLabel={t("selection.title")}
              className="text-foreground"
              style={{ fontSize: 16, lineHeight: 24, minHeight: 120 }}
            />
          </ScrollView>
          <View
            className="px-5 pt-3"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <Text className="text-xs text-muted-foreground mb-3">
              {t("selection.hint")}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={copyAll}
              className="min-h-11 items-center justify-center rounded-lg bg-primary active:opacity-80"
            >
              <Text className="text-sm font-semibold text-primary-foreground">
                {t("selection.copy_all")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
