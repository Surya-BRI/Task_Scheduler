export const DESIGN_LIST_TIMER_STORAGE_PREFIX = 'design_list_task_timer_'
export const TIMER_SYNC_EVENT = 'design-list-task-timer-sync'

export function timerStorageKey(taskId: string) {
  return `${DESIGN_LIST_TIMER_STORAGE_PREFIX}${taskId}`
}

export function readTimerRunStartAt(taskId: string): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(timerStorageKey(taskId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return typeof parsed.runStartAt === 'number' ? parsed.runStartAt : null
  } catch {
    return null
  }
}

/** First task id with a running timer in sessionStorage (optionally excluding one). */
export function findRunningTimerTaskId(excludeTaskId?: string): string | null {
  if (typeof window === 'undefined') return null
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i)
    if (!key?.startsWith(DESIGN_LIST_TIMER_STORAGE_PREFIX)) continue
    const taskId = key.slice(DESIGN_LIST_TIMER_STORAGE_PREFIX.length)
    if (!taskId || (excludeTaskId && taskId === excludeTaskId)) continue
    if (readTimerRunStartAt(taskId) != null) return taskId
  }
  return null
}

/** True when this task has timer state in sessionStorage (running or paused). */
export function hasLocalTimerEntry(taskId: string): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(timerStorageKey(taskId)) != null
}

/**
 * Resolve which task (if any) has an active running clock for this designer.
 * Local sessionStorage wins; stale server state after pause is ignored.
 */
export function resolveActiveRunningTaskId(
  serverTaskId: string | null | undefined,
  excludeTaskId?: string,
): string | null {
  const local = findRunningTimerTaskId(excludeTaskId)
  if (local) return local

  if (!serverTaskId || serverTaskId === excludeTaskId) return null

  // Paused in this tab — local entry has runStartAt explicitly cleared.
  if (hasLocalTimerEntry(serverTaskId) && readTimerRunStartAt(serverTaskId) == null) {
    return null
  }

  return serverTaskId
}
