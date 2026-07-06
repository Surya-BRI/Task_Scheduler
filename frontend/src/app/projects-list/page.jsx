'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, getHomeRoute } from '@/lib/mock-auth'
import { ProjectScreen } from '@/features/projects/components/ProjectScreen'

export default function ProjectsListPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    if (session.role === 'SALESPERSON') {
      router.replace('/sales/projects-list')
      return
    }
    if (session.role !== 'HOD') {
      router.replace(getHomeRoute(session))
      return
    }
    setAuthorized(true)
  }, [router])

  if (!authorized) return null
  return <ProjectScreen />
}
