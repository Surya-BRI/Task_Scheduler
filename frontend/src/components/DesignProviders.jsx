'use client'

import { useEffect } from 'react'
import { DesignListProvider } from '@/state/DesignListContext'
import { clearLegacyAuthStorage } from '@/lib/session'
import { ensureSession } from '@/lib/session-api'

function SessionBootstrap() {
  useEffect(() => {
    clearLegacyAuthStorage()
    void ensureSession()
  }, [])

  return null
}

export default function DesignProviders({ children }) {
  return (
    <DesignListProvider>
      <SessionBootstrap />
      {children}
    </DesignListProvider>
  )
}
