// @ts-nocheck
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '../state/AuthContext'

export function ProtectedRoute({ children }) {
  const { isAuthenticated, isHydrated } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (isHydrated && !isAuthenticated) {
      router.replace(`/login?from=${encodeURIComponent(pathname ?? '/')}`)
    }
  }, [isAuthenticated, isHydrated, pathname, router])

  if (!isHydrated) {
    return null
  }

  if (!isAuthenticated) {
    return null
  }

  return children
}
