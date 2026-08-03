'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/mock-auth'
import { SessionBootstrapSkeleton } from '@/components/SessionBootstrapSkeleton'
import { DesignSchedulerScreen } from '@/features/scheduler/components/DesignSchedulerScreen'

export default function DesignSchedulerPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    if (session.role === 'DESIGNER') {
      router.replace('/designer/dashboard')
      return
    }
    if (session.role === 'SALESPERSON') {
      router.replace('/sales/tasks')
      return
    }
    if (session.role === 'QS') {
      router.replace('/qs/projects')
      return
    }
    setAllowed(true)
  }, [router])

  if (!allowed) return <SessionBootstrapSkeleton label="Loading scheduler" />

  return (
    <Suspense fallback={<SessionBootstrapSkeleton label="Loading scheduler" />}>
      <DesignSchedulerScreen />
    </Suspense>
  )
}
