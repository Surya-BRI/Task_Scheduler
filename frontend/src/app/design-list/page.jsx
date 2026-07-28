'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/mock-auth'
import { DesignListScreen } from '@/features/design-list/components/DesignListScreen'

function DesignListPageInner() {
  const router = useRouter()
  const [role, setRole] = useState(null)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    if (session.role === 'DESIGNER') {
      router.replace('/design-list/tasks')
      return
    }
    if (session.role === 'QS') {
      router.replace('/qs/projects')
      return
    }
    if (session.role === 'SALESPERSON') {
      router.replace('/sales/design-list')
      return
    }
    setRole('HOD')
  }, [router])

  if (role !== 'HOD') return null

  return <DesignListScreen />
}

export default function DesignListPage() {
  return (
    <Suspense fallback={null}>
      <DesignListPageInner />
    </Suspense>
  )
}
