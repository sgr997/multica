import { useMemo } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ProjectPickerBody } from "@/components/issue/pickers/project-picker-body";
import { useBatchPicker } from "@/components/issue/batch/use-batch-picker";
import { projectListOptions } from "@/data/queries/projects";
import { useWorkspaceStore } from "@/data/workspace-store";
import { selectionSpansProjects } from "@/lib/issue-batch";
import { useNativeSearchBar } from "@/lib/use-native-search-bar";
import { useT } from "@/lib/i18n";

export default function BatchProjectPickerRoute() {
  const { t } = useT("issues");
  const { surface } = useLocalSearchParams<{ surface?: string }>();
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { ids, issues, apply } = useBatchPicker(surface);
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const query = useNativeSearchBar(t("picker.search_projects"), {
    autoFocus: true,
  });

  const sharedProjectId = useMemo(() => {
    const first = issues[0]?.project_id ?? null;
    return issues.every((issue) => (issue.project_id ?? null) === first)
      ? first
      : null;
  }, [issues]);
  const value = useMemo(
    () =>
      sharedProjectId
        ? projects.find((project) => project.id === sharedProjectId) ?? null
        : null,
    [projects, sharedProjectId],
  );
  const mixed = selectionSpansProjects(issues) || (!!sharedProjectId && !value);

  const commit = (projectId: string | null) => {
    apply({ project_id: projectId });
    router.back();
  };

  return (
    <ProjectPickerBody
      value={value}
      mixed={mixed}
      query={query}
      onChange={(next) => {
        if (!mixed) {
          commit(next?.id ?? null);
          return;
        }
        Alert.alert(
          t("batch.project_move_title", { count: ids.length }),
          t("batch.project_move_desc", {
            count: ids.length,
            project: next?.title ?? t("picker.no_project"),
          }),
          [
            { text: t("batch.cancel"), style: "cancel" },
            {
              text: t("batch.project_move_confirm"),
              onPress: () => commit(next?.id ?? null),
            },
          ],
        );
      }}
    />
  );
}
