'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/mock-auth'
import { DesignListScreen } from '@/features/design-list/components/DesignListScreen'

export default function DesignListPage() {
  const router = useRouter()
  const [role, setRole] = useState(null)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    if (session.role === 'DESIGNER') {
      // Designers always see their own work list
      router.replace('/design-list/tasks')
      return
    }
    // HOD — show full list
    setRole('HOD')
  }, [router])

  if (role !== 'HOD') return null

  return <DesignListScreen />
}
