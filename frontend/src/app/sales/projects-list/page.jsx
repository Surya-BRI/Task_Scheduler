'use client'

import { useRoleGuard } from '@/lib/use-role-guard'
import { ProjectScreen } from '@/features/projects/components/ProjectScreen'
import { FROM_SALES_PROJECTS_LIST } from '@/lib/design-list-routes'

export default function SalesProjectsListPage() {
  const authorized = useRoleGuard(['SALESPERSON'])
  if (!authorized) return null
  return <ProjectScreen workflowFrom={FROM_SALES_PROJECTS_LIST} />
}
