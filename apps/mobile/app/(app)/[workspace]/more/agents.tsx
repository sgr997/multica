/**
 * Legacy deep-link target. Agents used to live behind More → Agents; it is
 * now a first-class bottom tab, so this path only redirects. Keeping the
 * route (instead of deleting the file) means old notifications, bookmarks
 * and links still land on the list.
 */
import { Redirect } from "expo-router";
import { useWorkspaceStore } from "@/data/workspace-store";

export default function AgentsRedirect() {
  const slug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  return <Redirect href={slug ? `/${slug}/agents` : "/select-workspace"} />;
}
