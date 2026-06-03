'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DesignerDesignListScreen } from '@/features/design-list/components/DesignerDesignListScreen'
import { getSession } from '@/lib/mock-auth'

export default function DesignerMyWorkPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (!session || session.role !== 'DESIGNER') {
      router.replace('/login')
      return
    }
    setAllowed(true)
  }, [router])

  if (!allowed) return null

  return <DesignerDesignListScreen />
}
