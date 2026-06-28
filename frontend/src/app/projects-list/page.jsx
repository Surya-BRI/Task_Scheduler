'use client'

import { useRoleGuard } from '@/lib/use-role-guard'
import { ProjectScreen } from '@/features/projects/components/ProjectScreen'

export default function ProjectsListPage() {
  const authorized = useRoleGuard(['HOD'])
  if (!authorized) return null
  return <ProjectScreen />
}
