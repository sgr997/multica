import { useMemo, useRef } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Text } from "@/components/ui/text";
import {
  DueDatePickerBody,
  type DueDatePickerBodyHandle,
} from "@/components/issue/pickers/due-date-picker-body";
import { useBatchPicker } from "@/components/issue/batch/use-batch-picker";
import { useT } from "@/lib/i18n";

export default function BatchDueDatePickerRoute() {
  const { t } = useT("issues");
  const { surface } = useLocalSearchParams<{ surface?: string }>();
  const { issues, apply } = useBatchPicker(surface);
  const ref = useRef<DueDatePickerBodyHandle>(null);

  const sharedDueDate = useMemo(() => {
    const first = issues[0]?.due_date ?? null;
    return issues.every((issue) => (issue.due_date ?? null) === first)
      ? first
      : null;
  }, [issues]);
  const hasValue = issues.some((issue) => !!issue.due_date);

  const done = () => {
    const iso = ref.current?.getIso();
    if (iso) apply({ due_date: iso });
    router.back();
  };

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <Text className="text-base font-semibold text-foreground">
          {t("batch.due_date")}
        </Text>
        <View className="flex-row items-center gap-1">
          {hasValue ? (
            <Pressable
              onPress={() => {
                apply({ due_date: null });
                router.back();
              }}
              hitSlop={6}
              className="px-2 py-1 rounded-md active:bg-secondary"
            >
              <Text className="text-sm text-destructive">
                {t("picker.clear")}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={done}
            hitSlop={6}
            className="px-2 py-1 rounded-md active:bg-secondary"
          >
            <Text className="text-sm font-medium text-primary">
              {t("common:actions.done")}
            </Text>
          </Pressable>
        </View>
      </View>
      <DueDatePickerBody ref={ref} value={sharedDueDate} />
    </View>
  );
}
