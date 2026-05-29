import { Suspense } from 'react';
import { TeamActivityFeedScreenInner } from '@/features/team-activity/components/TeamActivityFeedScreen';

export default function DesignerTeamActivityPage() {
  return (
    <Suspense fallback={<div className="app-shell flex min-h-dvh items-center justify-center font-sans"><p className="text-sm text-slate-600">Loading team activity...</p></div>}>
      <TeamActivityFeedScreenInner />
    </Suspense>
  );
}
