import { describe, expect, it } from 'vitest'
import {
  canAccessTransactions,
  getTransactionBoardColumns,
  getTransactionDropdownItems,
  getTransactionView,
  isTransactionNavItemActive,
  isTransactionsWorkflow,
  TRANSACTION_VIEWS,
} from './transaction-views'

describe('transaction views', () => {
  it('exposes four HOD/Sales/Designer transaction options', () => {
    expect(TRANSACTION_VIEWS.map((view) => view.label)).toEqual([
      'Design WIP',
      'Design Completed',
      'Design Rework / Error List',
      'Design Approval List',
    ])
  })

  it('maps each view to the required Kanban columns', () => {
    expect(getTransactionBoardColumns('design-wip').map((col) => col.title)).toEqual([
      'Design Task New',
      'Design Planned',
      'In Progress',
      'Design Completed',
      'HOD Review',
      'Sales Review',
      'Rework / Error',
      'Client Accepted',
      'Client Rejected',
      'On Hold',
    ])
    expect(getTransactionBoardColumns('design-completed').map((col) => col.status)).toEqual([
      'DESIGN_COMPLETED',
    ])
    expect(getTransactionBoardColumns('design-rework')).toHaveLength(7)
    expect(getTransactionBoardColumns('design-approval').map((col) => col.status)).not.toContain('ON_HOLD')
    expect(getTransactionBoardColumns('design-approval')).toHaveLength(9)
  })

  it('treats only HOD, Sales, and Designer as transaction roles', () => {
    expect(canAccessTransactions('HOD')).toBe(true)
    expect(canAccessTransactions('SALESPERSON')).toBe(true)
    expect(canAccessTransactions('DESIGNER')).toBe(true)
    expect(canAccessTransactions('QS')).toBe(false)
  })

  it('detects transactions workflow back-nav tokens', () => {
    expect(isTransactionsWorkflow(getTransactionView('design-wip').from)).toBe(true)
    expect(isTransactionsWorkflow('sales-queue')).toBe(false)
  })

  it('builds role-specific flat dropdown lists without cross-role leakage', () => {
    expect(getTransactionDropdownItems('HOD').map((item) => item.label)).toEqual([
      'Design WIP',
      'Design Completed',
      'Design Rework / Error List',
      'Design Approval List',
      'Projects List',
      'Master Scheduler',
      'Projects Overview',
      'Chatter',
      'Team Activity Feed',
    ])

    expect(getTransactionDropdownItems('DESIGNER').map((item) => item.label)).toEqual([
      'Design WIP',
      'Design Completed',
      'Design Rework / Error List',
      'Design Approval List',
      'Design List',
      'Scheduler Dashboard',
      'Chatter',
      'Team Activity Feed',
    ])

    expect(getTransactionDropdownItems('SALESPERSON').map((item) => item.label)).toEqual([
      'Design WIP',
      'Design Completed',
      'Design Rework / Error List',
      'Design Approval List',
      'Projects List',
      'Sales Review',
      'Projects Overview',
      'Chatter',
      'Team Activity Feed',
    ])

    expect(getTransactionDropdownItems('SALESPERSON').map((item) => item.path)).not.toContain('/design-scheduler')
  })

  it('marks design completed view as active only on its route', () => {
    const completed = getTransactionView('design-completed')
    const item = { label: completed.label, path: completed.path, match: (pathname) => pathname === completed.path }
    expect(isTransactionNavItemActive('/transactions/design-completed', item)).toBe(true)
    expect(isTransactionNavItemActive('/transactions/design-wip', item)).toBe(false)
  })
})
