import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { commonIssueFields } from "@multica/core/issues/batch";
import type { IssueAssigneeType } from "@multica/core/types";
import {
  AssigneePickerBody,
  type AssigneeValue,
} from "@/components/issue/pickers/assignee-picker-body";
import { useBatchPicker } from "@/components/issue/batch/use-batch-picker";
import { agentAssignmentNeedsRunConfirm } from "@/lib/issue-batch";
import { useNativeSearchBar } from "@/lib/use-native-search-bar";
import { useT } from "@/lib/i18n";

export default function BatchAssigneePickerRoute() {
  const { t } = useT("issues");
  const { surface } = useLocalSearchParams<{ surface?: string }>();
  const { ids, issues, apply } = useBatchPicker(surface);
  const query = useNativeSearchBar(t("picker.search_people"), { autoFocus: true });
  const common = commonIssueFields(issues);
  const value: AssigneeValue =
    common.assignee?.type && common.assignee.id
      ? {
          type: common.assignee.type as IssueAssigneeType,
          id: common.assignee.id,
        }
      : null;

  const commit = (next: AssigneeValue) => {
    apply(
      next
        ? { assignee_type: next.type, assignee_id: next.id }
        : { assignee_type: null, assignee_id: null },
    );
    router.back();
  };

  const onChange = (next: AssigneeValue) => {
    if (
      !agentAssignmentNeedsRunConfirm(next?.type ?? null, issues, ids.length)
    ) {
      commit(next);
      return;
    }
    Alert.alert(
      t("batch.run_confirm_title", { count: ids.length }),
      t("batch.run_confirm_desc", { count: ids.length }),
      [
        { text: t("batch.cancel"), style: "cancel" },
        {
          text: t("batch.run_confirm"),
          onPress: () => commit(next),
        },
      ],
    );
  };

  return (
    <AssigneePickerBody
      value={value}
      mixed={issues.length > 0 && common.assignee === null}
      query={query}
      onChange={onChange}
    />
  );
}
