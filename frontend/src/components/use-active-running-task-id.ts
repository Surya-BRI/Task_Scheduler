'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  TIMER_SYNC_EVENT,
  TIMER_LIFECYCLE_EVENT,
  findRunningTimerTaskId,
} from './design-list-task-timer-storage'

export const ACTIVE_TIMER_BLOCKED_MESSAGE =
  'Pause or complete the task that is currently running before starting another.'

/**
 * Which task has an active running clock in this browser (shared across tabs via localStorage).
 * A paused timer (runStartAt null) never blocks others.
 */
export function useActiveRunningTaskId() {
  const [syncTick, setSyncTick] = useState(0)

  useEffect(() => {
    function onSync() {
      setSyncTick((n) => n + 1)
    }
    function onStorage(event: StorageEvent) {
      if (!event.key?.startsWith('design_list_task_timer_')) return
      onSync()
    }
    window.addEventListener(TIMER_SYNC_EVENT, onSync)
    window.addEventListener(TIMER_LIFECYCLE_EVENT, onSync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(TIMER_SYNC_EVENT, onSync)
      window.removeEventListener(TIMER_LIFECYCLE_EVENT, onSync)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const activeRunningTaskId = useMemo(() => {
    void syncTick
    return findRunningTimerTaskId()
  }, [syncTick])

  const isStartBlockedForTask = useCallback(
    (taskId: string) => {
      const runningId = findRunningTimerTaskId()
      if (!runningId) return false
      return runningId !== String(taskId)
    },
    [syncTick],
  )

  return { activeRunningTaskId, isStartBlockedForTask }
}
