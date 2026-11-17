/**
 * Agent label formSheet. Workspace `resource_type=agent` catalog, multi-select
 * with local search, one save. The diff (not the whole selection) is sent to
 * the attach/detach endpoints on save; selection changes stay local until then.
 */
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import type { Label } from "@multica/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { agentLabelsOptions } from "@/data/queries/agents";
import { labelListOptions } from "@/data/queries/labels";
import { useSaveAgentLabels } from "@/data/mutations/agents";
import { useCreateLabel } from "@/data/mutations/labels";
import { useWorkspaceStore } from "@/data/workspace-store";
import { toggleAgentLabel } from "@/lib/agent-labels";
import { pickInlineColor } from "@/lib/inline-color";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";
import { useT } from "@/lib/i18n";

export default function AgentLabelsSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("agents");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];
  const save = useSaveAgentLabels(id);
  const createLabel = useCreateLabel();

  const current = useQuery(agentLabelsOptions(wsId, id));
  const catalog = useQuery(labelListOptions(wsId, "agent"));
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Label[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  // `draft === null` means "untouched": show the server state. The first tap
  // seeds the draft from the same list so the sheet stays usable even if the
  // detail screen had not cached the labels yet.
  const currentLabels = current.data ?? [];
  const selected = draft ?? currentLabels;
  const selectedIds = useMemo(
    () => new Set(selected.map((label) => label.id)),
    [selected],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(catalog.data ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((label) => !q || label.name.toLowerCase().includes(q));
  }, [catalog.data, query]);

  const trimmedQuery = query.trim();
  const showCreate =
    trimmedQuery.length > 0 &&
    !(catalog.data ?? []).some(
      (label) => label.name.toLowerCase() === trimmedQuery.toLowerCase(),
    );

  const toggle = (label: Label) => {
    setDraft((value) => toggleAgentLabel(value ?? currentLabels, label));
  };

  const create = async () => {
    if (creatingRef.current || !trimmedQuery) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const label = await createLabel.mutateAsync({
        name: trimmedQuery,
        color: pickInlineColor(trimmedQuery),
        resource_type: "agent",
      });
      setDraft((value) => {
        const base = value ?? currentLabels;
        return base.some((item) => item.id === label.id)
          ? base
          : [...base, label];
      });
      setQuery("");
    } catch (error) {
      Alert.alert(
        t("labels.title"),
        t("labels.create_failed", {
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await save.mutateAsync({ current: currentLabels, next: selected });
      router.back();
    } catch (error) {
      Alert.alert(
        t("labels.title"),
        t("labels.save_failed", {
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
      setSaving(false);
    }
  };

  const loading = (current.isLoading && !current.data) || (catalog.isLoading && !catalog.data);
  const errored = (current.isError && !current.data) || (catalog.isError && !catalog.data);

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <Text className="text-base font-semibold text-foreground">
          {t("labels.title")}
        </Text>
        <Button variant="ghost" size="sm" onPress={() => router.back()}>
          <Text>{t("common:actions.close")}</Text>
        </Button>
      </View>

      <View className="px-4 py-2">
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder={t("labels.search_placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : errored ? (
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-center text-sm text-muted-foreground">
            {t("labels.load_failed")}
          </Text>
          <Button
            variant="outline"
            onPress={() => {
              void current.refetch();
              void catalog.refetch();
            }}
          >
            <Text>{t("common:actions.retry")}</Text>
          </Button>
        </View>
      ) : rows.length === 0 && !showCreate ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted-foreground">
            {(catalog.data ?? []).length === 0
              ? t("labels.catalog_empty")
              : t("labels.no_matches")}
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-2 pb-4"
          keyboardShouldPersistTaps="handled"
        >
          {showCreate ? (
            <Pressable
              onPress={() => void create()}
              disabled={creating}
              className="flex-row items-center gap-3 rounded-lg px-2 py-2.5 active:bg-secondary"
            >
              <Ionicons
                name="add"
                size={22}
                color={creating ? theme.mutedForeground : theme.brand}
              />
              <View
                className="size-3 rounded-full"
                style={{ backgroundColor: pickInlineColor(trimmedQuery) }}
              />
              <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1}>
                {t("labels.create", { name: trimmedQuery })}
              </Text>
            </Pressable>
          ) : null}
          {rows.map((label) => {
            const checked = selectedIds.has(label.id);
            return (
              <Pressable
                key={label.id}
                onPress={() => toggle(label)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                className="flex-row items-center gap-3 rounded-lg px-2 py-2.5 active:bg-secondary"
              >
                <Ionicons
                  name={checked ? "checkmark-circle" : "ellipse-outline"}
                  size={22}
                  color={checked ? theme.brand : theme.mutedForeground}
                />
                <View
                  className="size-3 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <Text
                  className="min-w-0 flex-1 text-sm text-foreground"
                  numberOfLines={1}
                >
                  {label.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View className="border-t border-border px-4 py-3">
        <Button
          onPress={() => void confirm()}
          disabled={saving || creating || loading || errored}
        >
          <Text>{saving ? t("labels.saving") : t("labels.save")}</Text>
        </Button>
      </View>
    </View>
  );
}
