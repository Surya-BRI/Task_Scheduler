'use client'

import { Suspense } from 'react'
import { useRoleGuard } from '@/lib/use-role-guard'
import { SessionBootstrapSkeleton } from '@/components/SessionBootstrapSkeleton'
import { DesignSchedulerScreen } from '@/features/scheduler/components/DesignSchedulerScreen'

export default function SalesMasterSchedulerPage() {
  const authorized = useRoleGuard(['SALESPERSON'])
  if (!authorized) return null

  return (
    <Suspense fallback={<SessionBootstrapSkeleton label="Loading scheduler" />}>
      <DesignSchedulerScreen readOnly />
    </Suspense>
  )
}
