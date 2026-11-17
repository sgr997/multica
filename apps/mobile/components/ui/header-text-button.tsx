import { Pressable } from "react-native";
import { Text } from "@/components/ui/text";

/** Compact text action for the iOS navigation header (Cancel / Select all). */
export function HeaderTextButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={disabled ? "px-2 opacity-40" : "px-2 active:opacity-60"}
    >
      <Text className="text-base text-primary">{label}</Text>
    </Pressable>
  );
}
