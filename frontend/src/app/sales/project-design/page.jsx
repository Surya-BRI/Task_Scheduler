'use client'

import { useRoleGuard } from '@/lib/use-role-guard'
import { ProjectDesignHub } from '@/features/projects/components/ProjectDesignHub'
import { FROM_SALES_PROJECT_DESIGN } from '@/lib/design-list-routes'

export default function SalesProjectDesignPage() {
  const authorized = useRoleGuard(['SALESPERSON'])
  if (!authorized) return null
  return <ProjectDesignHub workflowFrom={FROM_SALES_PROJECT_DESIGN} />
}
