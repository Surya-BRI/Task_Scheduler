'use client'

import { useRoleGuard } from '@/lib/use-role-guard'
import { DesignListScreen } from '@/features/design-list/components/DesignListScreen'
import { FROM_SALES_DESIGN_LIST } from '@/lib/design-list-routes'

export default function SalesDesignListPage() {
  const authorized = useRoleGuard(['SALESPERSON'])
  if (!authorized) return null
  return <DesignListScreen workflowFrom={FROM_SALES_DESIGN_LIST} />
}
