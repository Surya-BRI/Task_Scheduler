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
    statuses: ['DESIGN_COMPLETED'],
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

/** @typedef {{ label: string, path: string, match?: (pathname: string) => boolean }} TransactionNavItem */

const HOD_NAV_ITEMS = [
  { label: 'Projects List', path: '/projects-list' },
  { label: 'Master Scheduler', path: '/design-scheduler' },
  { label: 'Projects Overview', path: '/projects-overview' },
  { label: 'Chatter', path: '/chatter' },
  { label: 'Team Activity Feed', path: '/team-activity' },
]

const DESIGNER_NAV_ITEMS = [
  { label: 'Design List', path: '/design-list/tasks' },
  { label: 'Scheduler Dashboard', path: '/designer/dashboard' },
  { label: 'Chatter', path: '/chatter' },
  { label: 'Team Activity Feed', path: '/designer/team-activity' },
]

const SALES_NAV_ITEMS = [
  { label: 'Projects List', path: '/sales/projects-list' },
  { label: 'Sales Review', path: '/sales/tasks' },
  { label: 'Projects Overview', path: '/sales/projects-overview' },
  { label: 'Chatter', path: '/chatter' },
  { label: 'Team Activity Feed', path: '/sales/team-activity' },
]

function transactionViewItems() {
  return TRANSACTION_VIEWS.map((view) => ({
    label: view.label,
    path: view.path,
    match: (pathname) => pathname === view.path || pathname.startsWith(`${view.path}/`),
  }))
}

/**
 * Role-specific Transactions dropdown items (transaction views + existing top-nav destinations).
 * @param {string | null | undefined} role
 * @returns {TransactionNavItem[]}
 */
export function getTransactionDropdownItems(role) {
  const items = transactionViewItems()

  switch (String(role ?? '')) {
    case 'HOD':
      return [...items, ...HOD_NAV_ITEMS]
    case 'DESIGNER':
      return [...items, ...DESIGNER_NAV_ITEMS]
    case 'SALESPERSON':
      return [...items, ...SALES_NAV_ITEMS]
    default:
      return items
  }
}

export function isTransactionNavItemActive(pathname, item) {
  if (typeof item.match === 'function') return item.match(pathname)
  return pathname === item.path || pathname.startsWith(`${item.path}/`)
}
