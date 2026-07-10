import { beforeEach, describe, expect, it } from 'vitest'
import {
  findRunningTimerTaskId,
  timerStorageKey,
} from './design-list-task-timer-storage'

describe('design-list-task-timer-storage', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('findRunningTimerTaskId returns task with runStartAt', () => {
    sessionStorage.setItem(
      timerStorageKey('task-a'),
      JSON.stringify({ accumulatedSeconds: 60, runStartAt: Date.now() }),
    )
    sessionStorage.setItem(
      timerStorageKey('task-b'),
      JSON.stringify({ accumulatedSeconds: 0, runStartAt: null }),
    )
    expect(findRunningTimerTaskId()).toBe('task-a')
    expect(findRunningTimerTaskId('task-a')).toBeNull()
  })

  it('findRunningTimerTaskId returns null when all timers are paused', () => {
    sessionStorage.setItem(
      timerStorageKey('task-a'),
      JSON.stringify({ accumulatedSeconds: 300, runStartAt: null }),
    )
    expect(findRunningTimerTaskId()).toBeNull()
  })
})
