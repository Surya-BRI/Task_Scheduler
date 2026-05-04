import { Suspense } from "react";
import { TeamActivityFeedScreenInner } from "@/features/team-activity/components/TeamActivityFeedScreen";

function FeedbackFallback() {
  return (
    <div className="app-shell flex min-h-dvh items-center justify-center font-sans">
      <p className="text-sm text-slate-600">Loading team activity…</p>
    </div>
  );
}

export default function TeamActivityPage() {
  return (
    <Suspense fallback={<FeedbackFallback />}>
      <TeamActivityFeedScreenInner />
    </Suspense>
  );
}
