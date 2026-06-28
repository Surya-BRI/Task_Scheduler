'use client'

import { useRoleGuard } from '@/lib/use-role-guard'
import SalesTaskListScreen from '@/features/sales/components/SalesTaskListScreen'

export default function SalesTasksPage() {
  const authorized = useRoleGuard(['SALESPERSON'])
  if (!authorized) return null
  return <SalesTaskListScreen />
}
