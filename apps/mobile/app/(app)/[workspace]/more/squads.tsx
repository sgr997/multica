/**
 * Legacy / menu deep link for Squads. There is no standalone Squads tab or
 * screen: squads live in the Agents tab's second segment. This route switches
 * that already-mounted segment, then replaces itself with the tab root so the
 * back stack stays clean.
 */
import { useEffect } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAgentsTabStore } from "@/data/stores/agents-tab-store";
import { useWorkspaceStore } from "@/data/workspace-store";

export default function SquadsRedirect() {
  const { workspace } = useLocalSearchParams<{ workspace: string }>();
  const storedSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const setSegment = useAgentsTabStore((s) => s.setSegment);
  const slug = workspace || storedSlug;

  useEffect(() => {
    setSegment("squads");
    if (slug) router.replace(`/${slug}/agents`);
  }, [setSegment, slug]);

  return <View className="flex-1 bg-background" />;
}
