import { describe, expect, it } from 'vitest'
import { normalizeTaskStatus, TASK_STATUSES } from '@/lib/task-status'

describe('task-status', () => {
  it('defines the unified lifecycle vocabulary', () => {
    expect(TASK_STATUSES).toContain('IN_PROGRESS')
    expect(TASK_STATUSES).toContain('DESIGN_NEW')
    expect(TASK_STATUSES).not.toContain('WIP')
    expect(TASK_STATUSES).not.toContain('PENDING')
  })

  it('normalizes canonical statuses unchanged', () => {
    expect(normalizeTaskStatus('IN_PROGRESS')).toBe('IN_PROGRESS')
    expect(normalizeTaskStatus('DESIGN_NEW')).toBe('DESIGN_NEW')
    expect(normalizeTaskStatus('on-hold')).toBe('ON_HOLD')
  })

  it('defaults unknown or legacy values to DESIGN_NEW', () => {
    expect(normalizeTaskStatus('WIP')).toBe('DESIGN_NEW')
    expect(normalizeTaskStatus('PENDING')).toBe('DESIGN_NEW')
    expect(normalizeTaskStatus('')).toBe('DESIGN_NEW')
  })
})
