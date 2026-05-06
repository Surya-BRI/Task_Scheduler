'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DesignerDesignListScreen } from '@/features/design-list/components/DesignerDesignListScreen'
import { isAlexSessionActive } from '@/lib/alex-session'

export default function DesignerMyWorkPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (!isAlexSessionActive()) {
      router.replace('/alex-login')
      return
    }
    setAllowed(true)
  }, [router])

  if (!allowed) return null

  return <DesignerDesignListScreen />
}
