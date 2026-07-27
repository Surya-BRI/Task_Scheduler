'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '@/lib/api-client'
import {
  TIMER_SYNC_EVENT,
  TIMER_LIFECYCLE_EVENT,
  findRunningTimerTaskId,
  resolveActiveRunningTaskId,
} from './design-list-task-timer-storage'
import { connectDashboardRealtime } from '@/lib/realtime'

export const ACTIVE_TIMER_BLOCKED_MESSAGE =
  'Pause or complete the task that is currently running before starting another.'

/**
 * Which task has an active running clock for this designer.
 * Merges localStorage cache with GET /tasks/running-timer and socket updates.
 */
export function useActiveRunningTaskId() {
  const [syncTick, setSyncTick] = useState(0)
  const [serverRunningTaskId, setServerRunningTaskId] = useState<string | null>(null)

  const refreshServerRunning = useCallback(() => {
    apiClient
      .get('/tasks/running-timer')
      .then((data) => {
        const id = data?.taskId ? String(data.taskId) : null
        setServerRunningTaskId(id)
      })
      .catch(() => {
        // Keep last known server id on transient failures.
      })
  }, [])

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

    refreshServerRunning()
    const disconnect = connectDashboardRealtime({
      onTimerUpdated: (payload) => {
        if (payload.runStartedAt) {
          setServerRunningTaskId(String(payload.taskId))
        } else {
          setServerRunningTaskId((prev) =>
            prev && String(payload.taskId) === String(prev) ? null : prev,
          )
        }
        onSync()
      },
      onTimerPaused: () => {
        refreshServerRunning()
        onSync()
      },
    })

    return () => {
      window.removeEventListener(TIMER_SYNC_EVENT, onSync)
      window.removeEventListener(TIMER_LIFECYCLE_EVENT, onSync)
      window.removeEventListener('storage', onStorage)
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serverRunningTaskId read inside handler via refresh
  }, [refreshServerRunning])

  const activeRunningTaskId = useMemo(() => {
    void syncTick
    return resolveActiveRunningTaskId(serverRunningTaskId)
  }, [serverRunningTaskId, syncTick])

  const isStartBlockedForTask = useCallback(
    (taskId: string) => {
      const runningId = resolveActiveRunningTaskId(serverRunningTaskId)
      if (!runningId) return false
      return runningId !== String(taskId)
    },
    [serverRunningTaskId, syncTick],
  )

  return { activeRunningTaskId, isStartBlockedForTask }
}
