import {
  formatEodPromptLabel,
  localDateKey,
  markContinuedWorkingToday,
  markEodPromptDismissed,
  resolveEodPromptHour,
  isOvernightRunningTimer,
  EOD_AUTO_PAUSE_MS,
  type EodPromptHour,
} from './timer-end-of-day'

describe('timer-end-of-day', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('resolveEodPromptHour returns 18 after 6 PM', () => {
    const now = new Date('2026-07-10T18:05:00')
    expect(resolveEodPromptHour('task-1', now)).toBe(18)
  })

  it('resolveEodPromptHour returns 21 only after user continued at 18', () => {
    const dateKey = localDateKey(new Date('2026-07-10T21:05:00'))
    markContinuedWorkingToday('task-1', dateKey)
    markEodPromptDismissed('task-1', dateKey, 18)
    const now = new Date('2026-07-10T21:05:00')
    expect(resolveEodPromptHour('task-1', now)).toBe(21)
  })

  it('isOvernightRunningTimer when run started yesterday', () => {
    const runStartAt = new Date('2026-07-09T17:00:00').getTime()
    const now = new Date('2026-07-10T08:00:00')
    expect(isOvernightRunningTimer(runStartAt, now)).toBe(true)
  })

  it('formatEodPromptLabel', () => {
    expect(formatEodPromptLabel(18)).toBe('6:00 PM')
  })
})
