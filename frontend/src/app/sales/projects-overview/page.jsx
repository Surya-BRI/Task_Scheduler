'use client'

import { useRoleGuard } from '@/lib/use-role-guard'
import { ProjectsOverviewScreen } from '@/features/projects/components/ProjectsOverviewScreen'

export default function SalesProjectsOverviewPage() {
  const authorized = useRoleGuard(['SALESPERSON'])
  if (!authorized) return null
  return <ProjectsOverviewScreen />
}
