import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyRemoteTimerPause,
  findRunningTimerTaskId,
  readTimerRunStartAt,
  timerStorageKey,
  writeTimerState,
  writeTaskLifecycleSync,
  lifecycleStorageKey,
  TIMER_REMOTE_PAUSE_EVENT,
  TIMER_LIFECYCLE_EVENT,
} from './design-list-task-timer-storage'

describe('design-list-task-timer-storage', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('findRunningTimerTaskId returns task with runStartAt from localStorage', () => {
    writeTimerState('task-a', 60, Date.now())
    writeTimerState('task-b', 0, null)
    expect(findRunningTimerTaskId()).toBe('task-a')
    expect(findRunningTimerTaskId('task-a')).toBeNull()
  })

  it('findRunningTimerTaskId returns null when all timers are paused', () => {
    writeTimerState('task-a', 300, null)
    expect(findRunningTimerTaskId()).toBeNull()
  })

  it('migrates legacy sessionStorage timer into localStorage on read', () => {
    sessionStorage.setItem(
      timerStorageKey('task-a'),
      JSON.stringify({ accumulatedSeconds: 12, runStartAt: 12345 }),
    )
    expect(readTimerRunStartAt('task-a')).toBe(12345)
    expect(localStorage.getItem(timerStorageKey('task-a'))).toBeTruthy()
    expect(sessionStorage.getItem(timerStorageKey('task-a'))).toBeNull()
  })

  it('applyRemoteTimerPause freezes a running local timer and syncs server seconds', async () => {
    const startedAt = Date.now() - 45_000
    writeTimerState('task-a', 10, startedAt)

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
    const stored = JSON.parse(localStorage.getItem(timerStorageKey('task-a')) || '{}')
    expect(stored.accumulatedSeconds).toBe(300)
    expect(events).toHaveLength(1)
    expect(events[0].detail).toMatchObject({
      taskId: 'task-a',
      accumulatedSeconds: 300,
      handedOff: false,
    })
  })

  it('applyRemoteTimerPause is a no-op when the local timer is already paused', async () => {
    writeTimerState('task-a', 120, null)
    const fetchTimerState = vi.fn()
    const applied = await applyRemoteTimerPause('task-a', { fetchTimerState })
    expect(applied).toBe(false)
    expect(fetchTimerState).not.toHaveBeenCalled()
  })

  it('writeTaskLifecycleSync stores payload and emits lifecycle event', () => {
    const events: CustomEvent[] = []
    const onLife = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener(TIMER_LIFECYCLE_EVENT, onLife)

    writeTaskLifecycleSync('task-a', { status: 'ON_HOLD', action: 'status_change' })

    window.removeEventListener(TIMER_LIFECYCLE_EVENT, onLife)

    const stored = JSON.parse(localStorage.getItem(lifecycleStorageKey('task-a')) || '{}')
    expect(stored.status).toBe('ON_HOLD')
    expect(stored.action).toBe('status_change')
    expect(events).toHaveLength(1)
    expect(events[0].detail).toMatchObject({
      taskId: 'task-a',
      status: 'ON_HOLD',
      action: 'status_change',
    })
  })
})
