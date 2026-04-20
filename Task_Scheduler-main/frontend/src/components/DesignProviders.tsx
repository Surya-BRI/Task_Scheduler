// @ts-nocheck
'use client'

import { AuthProvider } from '@/state/AuthContext'
import { DesignListProvider } from '@/state/DesignListContext'

export default function DesignProviders({ children }) {
  return (
    <AuthProvider>
      <DesignListProvider>{children}</DesignListProvider>
    </AuthProvider>
  )
}
