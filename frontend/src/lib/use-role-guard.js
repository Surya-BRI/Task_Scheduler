'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, getHomeRoute, ensureSession } from '@/lib/mock-auth'

/**
 * Client-side role guard backed by server session (/auth/me).
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
export function useRoleGuard(allowedRoles) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function verify() {
      let session = getSession()
      if (!session) {
        session = await ensureSession()
      }
      if (cancelled) return

      if (!session) {
        router.replace('/login')
        return
      }
      if (allowedRoles && !allowedRoles.includes(session.role)) {
        router.replace(getHomeRoute(session))
        return
      }
      setAuthorized(true)
    }

    void verify()
    return () => {
      cancelled = true
    }
  }, [router, allowedRoles])

  return authorized
}
