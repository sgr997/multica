import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { Stack, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { Button } from "@/components/ui/button";
import {
  getCurrentServerInputs,
  getDefaultServerInputs,
  prepareServerUrls,
  probeServer,
  saveServerConfig,
  serverUrlErrorKey,
} from "@/data/server-config";
import { resetClientDataForServerSwitch } from "@/data/session-reset";
import { useRuntimeConfigStore } from "@/lib/runtime-config";
import { deriveWebUrl } from "@/lib/server-url";
import { useT } from "@/lib/i18n";

export default function ServerSettings() {
  const { t } = useT("auth");
  const current = getCurrentServerInputs();
  const defaults = getDefaultServerInputs();
  const custom = useRuntimeConfigStore((s) => s.custom);
  const [apiUrl, setApiUrl] = useState(current.apiUrl);
  const [webUrl, setWebUrl] = useState(
    current.apiUrl && current.webUrl === deriveWebUrl(current.apiUrl)
      ? ""
      : current.webUrl,
  );
  const [submitting, setSubmitting] = useState<"checking" | "saving" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const commit = async (urls: ReturnType<typeof prepareServerUrls>) => {
    setSubmitting("checking");
    setError(null);
    try {
      await probeServer(urls.apiUrl);
      setSubmitting("saving");
      await saveServerConfig(urls);
      await resetClientDataForServerSwitch();
      router.replace("/login");
    } catch {
      setError(t("server.probe_failed"));
      setSubmitting(null);
    }
  };

  const onSave = () => {
    let urls: ReturnType<typeof prepareServerUrls>;
    try {
      urls = prepareServerUrls(apiUrl, webUrl);
    } catch (err) {
      setError(t(serverUrlErrorKey(err)));
      return;
    }

    if (urls.apiUrl === current.apiUrl && urls.webUrl === current.webUrl) {
      router.back();
      return;
    }

    Alert.alert(t("server.confirm_title"), t("server.confirm_body"), [
      { text: t("common:actions.cancel"), style: "cancel" },
      {
        text: t("server.confirm_action"),
        onPress: () => {
          void commit(urls);
        },
      },
    ]);
  };

  const restoreDefault = () => {
    setApiUrl(defaults.apiUrl);
    setWebUrl(
      defaults.apiUrl && defaults.webUrl === deriveWebUrl(defaults.apiUrl)
        ? ""
        : defaults.webUrl,
    );
    setError(null);
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t("server.title"),
          headerBackTitle: t("common:actions.back"),
        }}
      />
      <SafeAreaView edges={["bottom"]} className="flex-1 bg-background">
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerClassName="px-6 py-6 gap-6"
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-2">
              <Text className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {custom ? t("server.custom_badge") : t("server.default_badge")}
              </Text>
              <Text selectable className="text-sm text-foreground">
                {current.apiUrl || t("server.errors.empty")}
              </Text>
            </View>

            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">
                {t("server.api_label")}
              </Text>
              <TextField
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder={t("server.api_placeholder")}
                value={apiUrl}
                onChangeText={(value) => {
                  setApiUrl(value);
                  setError(null);
                }}
                editable={!submitting}
                invalid={!!error}
              />
              <Text className="text-xs text-muted-foreground">
                {t("server.api_help")}
              </Text>
            </View>

            <View className="gap-2">
              <Text className="text-sm font-medium text-foreground">
                {t("server.web_label")}
              </Text>
              <TextField
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder={t("server.web_placeholder")}
                value={webUrl}
                onChangeText={(value) => {
                  setWebUrl(value);
                  setError(null);
                }}
                editable={!submitting}
              />
              <Text className="text-xs text-muted-foreground">
                {t("server.web_help")}
              </Text>
            </View>

            <View className="rounded-lg border border-border bg-secondary/50 px-4 py-3">
              <Text className="text-sm text-muted-foreground">
                {t("server.warning")}
              </Text>
            </View>

            {error ? (
              <Text className="text-sm text-destructive">{error}</Text>
            ) : null}

            <View className="gap-3">
              <Button size="lg" disabled={!!submitting} onPress={onSave}>
                <Text>
                  {submitting === "checking"
                    ? t("server.checking")
                    : submitting === "saving"
                      ? t("server.saving")
                      : t("server.save")}
                </Text>
              </Button>
              <Button
                variant="ghost"
                disabled={!!submitting}
                onPress={restoreDefault}
              >
                <Text>{t("server.reset")}</Text>
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </>
  );
}
