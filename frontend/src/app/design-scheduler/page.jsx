'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/mock-auth'
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
      // Designers land on their own dashboard instead
      router.replace(`/designer/${session.designerId || session.id}`)
      return
    }
    setAllowed(true)
  }, [router])

  if (!allowed) return null

  return <DesignSchedulerScreen />
}
