'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, getHomeRoute } from '@/lib/mock-auth'

/**
 * Client-side role guard. Returns true once the session is confirmed to have
 * one of the allowed roles. Redirects to the role's home route otherwise.
 * @param {string[]} allowedRoles
 * @returns {boolean}
 */
export function useRoleGuard(allowedRoles) {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    if (allowedRoles && !allowedRoles.includes(session.role)) {
      router.replace(getHomeRoute(session))
      return
    }
    setAuthorized(true)
  }, [router])

  return authorized
}
