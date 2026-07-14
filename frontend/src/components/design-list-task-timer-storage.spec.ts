import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyRemoteTimerPause,
  findRunningTimerTaskId,
  readTimerRunStartAt,
  timerStorageKey,
  TIMER_REMOTE_PAUSE_EVENT,
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

  it('applyRemoteTimerPause freezes a running local timer and syncs server seconds', async () => {
    const startedAt = Date.now() - 45_000
    sessionStorage.setItem(
      timerStorageKey('task-a'),
      JSON.stringify({ accumulatedSeconds: 10, runStartAt: startedAt }),
    )

    const events: CustomEvent[] = []
    const onRemote = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener(TIMER_REMOTE_PAUSE_EVENT, onRemote)

    const applied = await applyRemoteTimerPause('task-a', {
      sessionClosed: false,
      fetchTimerState: async () => ({ accumulatedSeconds: 300, handedOff: false }),
    })

    window.removeEventListener(TIMER_REMOTE_PAUSE_EVENT, onRemote)

    expect(applied).toBe(true)
    expect(readTimerRunStartAt('task-a')).toBeNull()
    const stored = JSON.parse(sessionStorage.getItem(timerStorageKey('task-a')) || '{}')
    expect(stored.accumulatedSeconds).toBe(300)
    expect(events).toHaveLength(1)
    expect(events[0].detail).toMatchObject({
      taskId: 'task-a',
      accumulatedSeconds: 300,
      handedOff: false,
    })
  })

  it('applyRemoteTimerPause is a no-op when the local timer is already paused', async () => {
    sessionStorage.setItem(
      timerStorageKey('task-a'),
      JSON.stringify({ accumulatedSeconds: 120, runStartAt: null }),
    )
    const fetchTimerState = vi.fn()
    const applied = await applyRemoteTimerPause('task-a', { fetchTimerState })
    expect(applied).toBe(false)
    expect(fetchTimerState).not.toHaveBeenCalled()
  })
})
