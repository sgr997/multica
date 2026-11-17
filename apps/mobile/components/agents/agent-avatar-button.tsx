/**
 * Avatar editor shared by the agent edit form and the create form. Owns the
 * native action sheet (emoji / library / camera / remove), the emoji keyboard
 * modal, and the upload, then hands the final avatar URL back to the caller.
 *
 * Edit saves each pick immediately; create keeps it in local draft state —
 * the component only uploads the image, it never mutates the agent.
 */
import { useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { EmojiKeyboard, type EmojiType } from "rn-emoji-keyboard";
import { api, type FileAsset } from "@/data/api";
import { ActorAvatar } from "@/components/ui/actor-avatar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";
import { useT } from "@/lib/i18n";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function AgentAvatarButton({
  name,
  avatarUrl,
  size = 88,
  label,
  actorType = "agent",
  onPicked,
}: {
  name: string;
  avatarUrl: string | null;
  size?: number;
  label?: string;
  actorType?: "agent" | "squad";
  onPicked: (url: string | null) => void;
}) {
  const { t } = useT("agents");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const pickImage = async (camera: boolean) => {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t("edit.avatar_permission_title"),
          t("edit.avatar_permission_message"),
        );
        return;
      }
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_AVATAR_BYTES) {
      Alert.alert(
        t("edit.avatar_too_large_title"),
        t("edit.avatar_too_large_message"),
      );
      return;
    }
    setUploading(true);
    try {
      const file: FileAsset = {
        uri: asset.uri,
        name: asset.fileName ?? "agent-avatar.jpg",
        type: asset.mimeType ?? "image/jpeg",
      };
      const attachment = await api.uploadFile(file);
      onPicked(attachment.url);
    } catch (error) {
      Alert.alert(
        t("edit.avatar_failed", {
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
    } finally {
      setUploading(false);
    }
  };

  const openActions = () => {
    const actions = ["emoji", "library", "camera"];
    if (avatarUrl) actions.push("remove");
    actions.push("cancel");
    const removeIndex = avatarUrl ? 3 : -1;
    const cancelIndex = actions.length - 1;
    const options = actions.map((action) =>
      action === "emoji"
        ? t("edit.avatar_emoji")
        : action === "library"
          ? t("edit.avatar_library")
          : action === "camera"
            ? t("edit.avatar_take")
            : action === "remove"
              ? t("edit.avatar_remove")
              : t("common:actions.cancel"),
    );

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t("edit.avatar"),
        options,
        cancelButtonIndex: cancelIndex,
        destructiveButtonIndex: removeIndex >= 0 ? removeIndex : undefined,
      },
      (index) => {
        const action = actions[index];
        if (action === "emoji") setEmojiOpen(true);
        else if (action === "library") void pickImage(false);
        else if (action === "camera") void pickImage(true);
        else if (action === "remove") onPicked(null);
      },
    );
  };

  return (
    <View className="items-center gap-2">
      <Pressable onPress={openActions} disabled={uploading}>
        <ActorAvatar
          type={actorType}
          id={name || "new-agent"}
          name={name}
          avatarUrl={avatarUrl}
          size={size}
        />
        {uploading ? (
          <View className="absolute inset-0 items-center justify-center rounded-full bg-background/60">
            <ActivityIndicator />
          </View>
        ) : null}
      </Pressable>
      {label ? (
        <Text className="text-xs text-muted-foreground">{label}</Text>
      ) : null}

      <Modal
        visible={emojiOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEmojiOpen(false)}
      >
        <View className="flex-1" style={{ backgroundColor: theme.background }}>
          <View className="flex-row items-center justify-between px-4 py-3">
            <Text className="text-base font-semibold text-foreground">
              {t("edit.avatar_emoji")}
            </Text>
            <Button variant="ghost" size="sm" onPress={() => setEmojiOpen(false)}>
              <Text>{t("common:actions.close")}</Text>
            </Button>
          </View>
          <EmojiKeyboard
            onEmojiSelected={(picked: EmojiType) => {
              setEmojiOpen(false);
              onPicked(`emoji:${picked.emoji}`);
            }}
            enableSearchBar
            enableRecentlyUsed
            categoryPosition="top"
            theme={{
              backdrop: theme.background,
              knob: theme.mutedForeground,
              container: theme.popover,
              header: theme.foreground,
              skinTonesContainer: theme.secondary,
              category: {
                icon: theme.mutedForeground,
                iconActive: theme.foreground,
                container: theme.popover,
                containerActive: theme.secondary,
              },
              search: {
                background: theme.secondary,
                text: theme.foreground,
                placeholder: theme.mutedForeground,
                icon: theme.mutedForeground,
              },
              customButton: {
                icon: theme.mutedForeground,
                iconPressed: theme.foreground,
                background: theme.secondary,
                backgroundPressed: theme.muted,
              },
              emoji: { selected: theme.secondary },
            }}
          />
        </View>
      </Modal>
    </View>
  );
}
