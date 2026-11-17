import { router, useLocalSearchParams } from "expo-router";
import { commonIssueFields } from "@multica/core/issues/batch";
import { StatusPickerBody } from "@/components/issue/pickers/status-picker-body";
import { useBatchPicker } from "@/components/issue/batch/use-batch-picker";

export default function BatchStatusPickerRoute() {
  const { surface } = useLocalSearchParams<{ surface?: string }>();
  const { issues, apply } = useBatchPicker(surface);
  const common = commonIssueFields(issues);

  return (
    <StatusPickerBody
      value={common.status}
      onChange={(next) => {
        apply({ status: next });
        router.back();
      }}
    />
  );
}
