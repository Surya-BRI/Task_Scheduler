import { describe, expect, it } from 'vitest'
import {
  canAccessTransactions,
  getTransactionBoardColumns,
  getTransactionView,
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
      'DESIGN_NEW',
      'DESIGN_PLANNED',
      'IN_PROGRESS',
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
})
