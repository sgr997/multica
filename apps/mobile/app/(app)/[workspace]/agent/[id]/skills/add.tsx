/**
 * "Add skills" formSheet. Multi-select over the workspace skill library, one
 * POST /skills/add at the end (the endpoint upserts, so a re-submit is safe).
 *
 * Skills already attached stay visible but disabled — hiding them (what web's
 * dialog does) makes "why isn't X here?" impossible to answer on a phone.
 *
 * Search is local: GET /api/skills/search is ClawHub marketplace search and
 * returns candidates without workspace skill IDs, so it cannot drive this
 * picker. The library is fetched once; rendering is paged at 50 rows.
 */
import { useMemo, useState } from "react";
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
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { agentDetailOptions } from "@/data/queries/agents";
import { skillListOptions } from "@/data/queries/skills";
import { useAddAgentSkills } from "@/data/mutations/agents";
import { useWorkspaceStore } from "@/data/workspace-store";
import {
  SKILL_PAGE_SIZE,
  filterSkillLibrary,
  skillPage,
  toggleSelectedSkill,
} from "@/lib/agent-skills";
import { THEME } from "@/lib/theme";
import { useColorScheme } from "@/lib/use-color-scheme";
import { useT } from "@/lib/i18n";

export default function AddAgentSkillsSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { t } = useT("agents");
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme === "dark" ? "dark" : "light"];

  const detail = useQuery(agentDetailOptions(wsId, id));
  const library = useQuery(skillListOptions(wsId));
  const addSkills = useAddAgentSkills(id);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(SKILL_PAGE_SIZE);
  const [saving, setSaving] = useState(false);

  const attachedIds = useMemo(
    () => new Set((detail.data?.skills ?? []).map((skill) => skill.id)),
    [detail.data?.skills],
  );
  const filtered = useMemo(
    () => filterSkillLibrary(library.data ?? [], query),
    [library.data, query],
  );
  const page = skillPage(filtered, limit);

  const toggle = (skillId: string) => {
    if (attachedIds.has(skillId)) return;
    setSelected((current) => toggleSelectedSkill(current, skillId));
  };

  const confirm = async () => {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    const picked = (library.data ?? []).filter((skill) =>
      selected.has(skill.id),
    );
    try {
      await addSkills.mutateAsync(picked);
      router.back();
    } catch (error) {
      Alert.alert(
        t("skills.add_title"),
        t("skills.add_failed", {
          message: error instanceof Error ? error.message : "unknown",
        }),
      );
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <Text className="text-base font-semibold text-foreground">
          {t("skills.add_title")}
        </Text>
        <Button variant="ghost" size="sm" onPress={() => router.back()}>
          <Text>{t("common:actions.close")}</Text>
        </Button>
      </View>

      <View className="px-4 py-2">
        <TextField
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setLimit(SKILL_PAGE_SIZE);
          }}
          placeholder={t("skills.search_placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {library.isLoading && !library.data ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : library.isError && !library.data ? (
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-center text-sm text-muted-foreground">
            {t("skills.load_failed", {
              message:
                library.error instanceof Error
                  ? library.error.message
                  : "unknown",
            })}
          </Text>
          <Button variant="outline" onPress={() => library.refetch()}>
            <Text>{t("common:actions.retry")}</Text>
          </Button>
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-sm text-muted-foreground">
            {(library.data ?? []).length === 0
              ? t("skills.add_empty")
              : t("skills.add_empty_search")}
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-2 pb-4"
          keyboardShouldPersistTaps="handled"
        >
          {page.visible.map((skill) => {
            const attached = attachedIds.has(skill.id);
            const picked = selected.has(skill.id);
            return (
              <Pressable
                key={skill.id}
                onPress={() => toggle(skill.id)}
                disabled={attached}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked: picked || attached,
                  disabled: attached,
                }}
                className="flex-row items-center gap-3 rounded-lg px-2 py-2.5 active:bg-secondary"
              >
                <Ionicons
                  name={
                    attached || picked ? "checkmark-circle" : "ellipse-outline"
                  }
                  size={22}
                  color={
                    attached
                      ? theme.mutedForeground
                      : picked
                        ? theme.brand
                        : theme.mutedForeground
                  }
                />
                <View className={attached ? "min-w-0 flex-1 opacity-50" : "min-w-0 flex-1"}>
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="shrink text-sm font-medium text-foreground"
                      numberOfLines={1}
                    >
                      {skill.name}
                    </Text>
                    {attached ? (
                      <Text className="text-[10px] font-medium text-muted-foreground">
                        {t("skills.added")}
                      </Text>
                    ) : null}
                  </View>
                  <Text
                    className="text-xs text-muted-foreground"
                    numberOfLines={1}
                  >
                    {skill.description || t("skills.no_description")}
                  </Text>
                </View>
              </Pressable>
            );
          })}
          {page.hasMore ? (
            <Pressable
              onPress={() => setLimit((current) => current + SKILL_PAGE_SIZE)}
              className="items-center py-3"
            >
              <Text className="text-xs font-medium text-brand">
                {t("skills.show_more")}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <View className="border-t border-border px-4 py-3">
        <Button
          onPress={() => void confirm()}
          disabled={selected.size === 0 || saving}
        >
          <Text>
            {saving
              ? t("skills.add_saving")
              : selected.size > 0
                ? t("skills.add_confirm", { count: selected.size })
                : t("skills.add_confirm_empty")}
          </Text>
        </Button>
      </View>
    </View>
  );
}
