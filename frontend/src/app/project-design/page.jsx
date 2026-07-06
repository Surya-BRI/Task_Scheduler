'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession, getHomeRoute } from '@/lib/mock-auth'
import { ProjectDesignHub } from '@/features/projects/components/ProjectDesignHub'

export default function ProjectDesignRoutePage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/login')
      return
    }
    if (session.role === 'SALESPERSON') {
      router.replace('/sales/project-design')
      return
    }
    if (session.role !== 'HOD') {
      router.replace(getHomeRoute(session))
      return
    }
    setAuthorized(true)
  }, [router])

  if (!authorized) return null
  return <ProjectDesignHub />
}
