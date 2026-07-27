'use client'

import { useEffect, useRef } from 'react'
import {
  DESIGN_LIST_TASK_LIFECYCLE_PREFIX,
  TIMER_LIFECYCLE_EVENT,
} from '@/components/design-list-task-timer-storage'
import { connectDashboardRealtime } from '@/lib/realtime'

type Options = {
  /** Optional: only react to this task id (task details). Omit for list-wide refresh. */
  taskId?: string | null
  enabled?: boolean
  /** When false, only localStorage/CustomEvent — caller owns the socket. */
  enableRealtime?: boolean
  /** Debounce refresh callbacks (list views mount many timers; avoid refetch storms). */
  debounceMs?: number
  onRefresh: () => void
}

/**
 * Cross-tab + realtime refresh when a task's status/timer lifecycle changes
 * (submit, hold, etc.) or the dashboard broadcasts a task update.
 */
export function useTaskLifecycleRefresh({
  taskId = null,
  enabled = true,
  enableRealtime = true,
  debounceMs = 0,
  onRefresh,
}: Options) {
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  useEffect(() => {
    if (!enabled) return undefined

    let timer: ReturnType<typeof setTimeout> | null = null
    const run = () => {
      if (debounceMs > 0) {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => onRefreshRef.current(), debounceMs)
        return
      }
      onRefreshRef.current()
    }

    const matchesTask = (id: string | null | undefined) => {
      if (!taskId) return true
      return Boolean(id && String(id) === String(taskId))
    }

    function onLifecycle(event: Event) {
      const detail = (event as CustomEvent)?.detail
      if (!matchesTask(detail?.taskId)) return
      run()
    }

    function onStorage(event: StorageEvent) {
      if (!event.key?.startsWith(DESIGN_LIST_TASK_LIFECYCLE_PREFIX)) return
      const id = event.key.slice(DESIGN_LIST_TASK_LIFECYCLE_PREFIX.length)
      if (!matchesTask(id)) return
      run()
    }

    window.addEventListener(TIMER_LIFECYCLE_EVENT, onLifecycle)
    window.addEventListener('storage', onStorage)

    const disconnect = enableRealtime
      ? connectDashboardRealtime({
          onDashboardRefresh: (payload) => {
            if (taskId) {
              if (payload?.taskId && String(payload.taskId) === String(taskId)) {
                run()
                return
              }
              const changed = payload?.changedTaskIds
              if (Array.isArray(changed) && changed.some((id) => String(id) === String(taskId))) {
                run()
              }
              return
            }
            // List views: any task-related dashboard ping is a cue to refetch.
            if (
              payload?.taskId ||
              (Array.isArray(payload?.changedTaskIds) && payload.changedTaskIds.length > 0) ||
              (typeof payload?.event === 'string' &&
                (payload.event.includes('task') ||
                  payload.event.includes('status') ||
                  payload.event.includes('submit') ||
                  payload.event.includes('hold')))
            ) {
              run()
            }
          },
        })
      : () => {}

    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener(TIMER_LIFECYCLE_EVENT, onLifecycle)
      window.removeEventListener('storage', onStorage)
      disconnect()
    }
  }, [debounceMs, enabled, enableRealtime, taskId])
}
