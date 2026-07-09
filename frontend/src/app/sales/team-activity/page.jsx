'use client'

import { Suspense } from 'react'
import { useRoleGuard } from '@/lib/use-role-guard'
import { TeamActivityFeedScreenInner } from '@/features/team-activity/components/TeamActivityFeedScreen'

function FeedbackFallback() {
  return (
    <div className="app-shell flex min-h-dvh items-center justify-center font-sans">
      <p className="text-sm text-slate-600">Loading team activity…</p>
    </div>
  )
}

export default function SalesTeamActivityPage() {
  const authorized = useRoleGuard(['SALESPERSON'])
  if (!authorized) return null

  return (
    <Suspense fallback={<FeedbackFallback />}>
      <TeamActivityFeedScreenInner />
    </Suspense>
  )
}
