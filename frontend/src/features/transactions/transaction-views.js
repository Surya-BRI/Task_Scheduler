import { TASK_STATUSES } from '@/lib/task-status'
import { DESIGN_LIST_BOARD_COLUMNS } from '@/features/design-list/task-view-model'

export const TRANSACTION_ROLES = ['HOD', 'SALESPERSON', 'DESIGNER']

export { DESIGN_LIST_BOARD_COLUMNS }

const byStatus = Object.fromEntries(DESIGN_LIST_BOARD_COLUMNS.map((col) => [col.status, col]))

function columnsFor(statuses) {
  return statuses.map((status) => byStatus[status]).filter(Boolean)
}

/** @typedef {'design-wip' | 'design-completed' | 'design-rework' | 'design-approval'} TransactionViewId */

/** @type {Array<{ id: TransactionViewId, label: string, path: string, from: string, statuses: string[] }>} */
export const TRANSACTION_VIEWS = [
  {
    id: 'design-wip',
    label: 'Design WIP',
    path: '/transactions/design-wip',
    from: 'transactions-design-wip',
    statuses: [...TASK_STATUSES],
  },
  {
    id: 'design-completed',
    label: 'Design Completed',
    path: '/transactions/design-completed',
    from: 'transactions-design-completed',
    statuses: ['DESIGN_NEW', 'DESIGN_PLANNED', 'IN_PROGRESS', 'DESIGN_COMPLETED'],
  },
  {
    id: 'design-rework',
    label: 'Design Rework / Error List',
    path: '/transactions/design-rework',
    from: 'transactions-design-rework',
    statuses: [
      'DESIGN_NEW',
      'DESIGN_PLANNED',
      'IN_PROGRESS',
      'DESIGN_COMPLETED',
      'HOD_REVIEW',
      'SALES_REVIEW',
      'REWORK',
    ],
  },
  {
    id: 'design-approval',
    label: 'Design Approval List',
    path: '/transactions/design-approval',
    from: 'transactions-design-approval',
    statuses: [
      'DESIGN_NEW',
      'DESIGN_PLANNED',
      'IN_PROGRESS',
      'DESIGN_COMPLETED',
      'HOD_REVIEW',
      'SALES_REVIEW',
      'REWORK',
      'CLIENT_ACCEPTED',
      'CLIENT_REJECTED',
    ],
  },
]

export function getTransactionView(viewId) {
  return TRANSACTION_VIEWS.find((view) => view.id === viewId) ?? null
}

export function getTransactionBoardColumns(viewId) {
  const view = getTransactionView(viewId)
  if (!view) return DESIGN_LIST_BOARD_COLUMNS
  return columnsFor(view.statuses)
}

export function isTransactionsWorkflow(from) {
  return String(from ?? '').startsWith('transactions-')
}

export function canAccessTransactions(role) {
  return TRANSACTION_ROLES.includes(String(role ?? ''))
}

export function transactionPathForFrom(from) {
  const view = TRANSACTION_VIEWS.find((item) => item.from === from)
  return view?.path ?? '/transactions/design-wip'
}
