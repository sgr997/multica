import { router, useLocalSearchParams } from "expo-router";
import { commonIssueFields } from "@multica/core/issues/batch";
import { PriorityPickerBody } from "@/components/issue/pickers/priority-picker-body";
import { useBatchPicker } from "@/components/issue/batch/use-batch-picker";

export default function BatchPriorityPickerRoute() {
  const { surface } = useLocalSearchParams<{ surface?: string }>();
  const { issues, apply } = useBatchPicker(surface);
  const common = commonIssueFields(issues);

  return (
    <PriorityPickerBody
      value={common.priority}
      onChange={(next) => {
        apply({ priority: next });
        router.back();
      }}
    />
  );
}
