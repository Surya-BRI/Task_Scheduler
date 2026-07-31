'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { DesignListProvider } from '@/state/DesignListContext'
import { SessionBootstrapSkeleton } from '@/components/SessionBootstrapSkeleton'
import { clearLegacyAuthStorage, getSession } from '@/lib/session'
import { ensureSession } from '@/lib/session-api'

const PUBLIC_PATHS = new Set(['/login'])

function isPublicPath(pathname) {
  return Boolean(pathname && PUBLIC_PATHS.has(pathname))
}

export default function DesignProviders({ children }) {
  const pathname = usePathname()
  const isProtected = !isPublicPath(pathname)
  const [bootstrapped, setBootstrapped] = useState(!isProtected)

  useEffect(() => {
    let cancelled = false
    clearLegacyAuthStorage()

    if (!isProtected) {
      setBootstrapped(true)
      return () => {
        cancelled = true
      }
    }

    if (getSession()) {
      setBootstrapped(true)
      return () => {
        cancelled = true
      }
    }

    setBootstrapped(false)
    void ensureSession().finally(() => {
      if (!cancelled) setBootstrapped(true)
    })

    return () => {
      cancelled = true
    }
  }, [pathname, isProtected])

  if (isProtected && !bootstrapped) {
    return (
      <DesignListProvider>
        <SessionBootstrapSkeleton />
      </DesignListProvider>
    )
  }

  return <DesignListProvider>{children}</DesignListProvider>
}
