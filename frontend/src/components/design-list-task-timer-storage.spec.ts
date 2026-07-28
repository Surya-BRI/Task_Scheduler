import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyRemoteTimerPause,
  applyServerTimerState,
  findRunningTimerTaskId,
  readTimerRunStartAt,
  readTimerState,
  timerStorageKey,
  writeTimerState,
  writeTaskLifecycleSync,
  lifecycleStorageKey,
  TIMER_REMOTE_PAUSE_EVENT,
  TIMER_LIFECYCLE_EVENT,
  TIMER_SYNC_EVENT,
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

  it('applyServerTimerState caches server clock and emits sync', () => {
    const events: CustomEvent[] = []
    const onSync = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener(TIMER_SYNC_EVENT, onSync)

    const adopted = applyServerTimerState('task-a', {
      accumulatedSeconds: 90,
      runStartedAt: '2026-07-24T10:00:00.000Z',
    })

    window.removeEventListener(TIMER_SYNC_EVENT, onSync)

    expect(adopted.accumulatedSeconds).toBe(90)
    expect(adopted.runStartAt).toBe(Date.parse('2026-07-24T10:00:00.000Z'))
    expect(readTimerState('task-a')).toEqual(adopted)
    expect(events).toHaveLength(1)
  })

  it('applyServerTimerState clears run when handedOff/locked', () => {
    writeTimerState('task-a', 10, Date.now())
    const adopted = applyServerTimerState('task-a', {
      accumulatedSeconds: 40,
      runStartedAt: '2026-07-24T10:00:00.000Z',
      handedOff: true,
      locked: true,
    })
    expect(adopted.runStartAt).toBeNull()
    expect(adopted.accumulatedSeconds).toBe(40)
  })

  it('applyRemoteTimerPause freezes a running local timer and syncs server seconds', async () => {
    const startedAt = Date.now() - 45_000
    writeTimerState('task-a', 10, startedAt)

    const applied = await applyRemoteTimerPause('task-a', {
      sessionClosed: false,
      fetchTimerState: async () => ({ accumulatedSeconds: 300, handedOff: false }),
    })

    expect(applied).toBe(true)
    expect(readTimerRunStartAt('task-a')).toBeNull()
    const stored = JSON.parse(localStorage.getItem(timerStorageKey('task-a')) || '{}')
    expect(stored.accumulatedSeconds).toBe(300)
  })

  it('applyRemoteTimerPause emits remote-pause when session is closed', async () => {
    writeTimerState('task-a', 10, Date.now())
    const events: CustomEvent[] = []
    const onRemote = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener(TIMER_REMOTE_PAUSE_EVENT, onRemote)

    await applyRemoteTimerPause('task-a', {
      sessionClosed: true,
      fetchTimerState: async () => ({ accumulatedSeconds: 50, handedOff: true, locked: true }),
    })

    window.removeEventListener(TIMER_REMOTE_PAUSE_EVENT, onRemote)
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0].detail).toMatchObject({ taskId: 'task-a', sessionClosed: true })
  })

  it('applyRemoteTimerPause is a no-op signal when the local timer is already paused', async () => {
    writeTimerState('task-a', 120, null)
    const fetchTimerState = vi.fn(async () => ({ accumulatedSeconds: 120 }))
    const applied = await applyRemoteTimerPause('task-a', { fetchTimerState })
    expect(applied).toBe(false)
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
