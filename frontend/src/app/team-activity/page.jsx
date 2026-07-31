import { Suspense } from "react";
import { SessionBootstrapSkeleton } from "@/components/SessionBootstrapSkeleton";
import { TeamActivityFeedScreenInner } from "@/features/team-activity/components/TeamActivityFeedScreen";

export default function TeamActivityPage() {
  return (
    <Suspense fallback={<SessionBootstrapSkeleton label="Loading team activity" />}>
      <TeamActivityFeedScreenInner />
    </Suspense>
  );
}
