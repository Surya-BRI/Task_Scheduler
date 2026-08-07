'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, getHomeRoute } from '@/lib/mock-auth'
import { SessionBootstrapSkeleton } from '@/components/SessionBootstrapSkeleton'
import { DesignListScreen } from '@/features/design-list/components/DesignListScreen'

function DesignListPageInner() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    if (session.role !== 'HOD') {
      router.replace(getHomeRoute(session))
      return
    }
    setAuthorized(true)
  }, [router])

  if (!authorized) return <SessionBootstrapSkeleton label="Loading design list" />

  return <DesignListScreen />
}

export default function DesignListPage() {
  return (
    <Suspense fallback={<SessionBootstrapSkeleton label="Loading design list" />}>
      <DesignListPageInner />
    </Suspense>
  )
}
