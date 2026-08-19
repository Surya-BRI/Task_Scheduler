'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { DesignListScreen } from '@/features/design-list/components/DesignListScreen'
import {
  getTransactionBoardColumns,
  getTransactionView,
  TRANSACTION_ROLES,
} from '@/features/transactions/transaction-views'
import { SessionBootstrapSkeleton } from '@/components/SessionBootstrapSkeleton'
import { useRoleGuard } from '@/lib/use-role-guard'

export default function TransactionsViewPage() {
  const params = useParams()
  const router = useRouter()
  const viewId = String(params?.view ?? '')
  const view = getTransactionView(viewId)
  const authorized = useRoleGuard(TRANSACTION_ROLES)

  useEffect(() => {
    if (authorized && !view) {
      router.replace('/transactions/design-wip')
    }
  }, [authorized, view, router])

  if (!authorized) {
    return <SessionBootstrapSkeleton label="Loading transactions" />
  }
  if (!view) {
    return <SessionBootstrapSkeleton label="Loading transactions" />
  }

  return (
    <DesignListScreen
      title={view.label}
      workflowFrom={view.from}
      defaultViewMode="board"
      lockBoardView
      hideReallocation
      boardColumns={getTransactionBoardColumns(view.id)}
      allowedStatuses={view.statuses}
    />
  )
}
