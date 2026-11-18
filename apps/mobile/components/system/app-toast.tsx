import { useEffect } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { useAppToastStore } from "@/data/app-toast-store";

const VISIBLE_MS = 1800;

export function AppToast() {
  const message = useAppToastStore((s) => s.message);
  const clear = useAppToastStore((s) => s.clear);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(clear, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, clear]);

  if (!message) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: insets.bottom + 88,
      }}
      className="items-center px-6"
    >
      <View className="rounded-full bg-foreground px-4 py-2">
        <Text className="text-sm text-background">{message}</Text>
      </View>
    </View>
  );
}
