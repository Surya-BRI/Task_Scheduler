export const DESIGN_LIST_TIMER_STORAGE_PREFIX = 'design_list_task_timer_'
export const TIMER_SYNC_EVENT = 'design-list-task-timer-sync'
/** Fired after a server-side handoff pauses a running timer in this browser tab. */
export const TIMER_REMOTE_PAUSE_EVENT = 'design-list-task-timer-remote-pause'

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

function readTimerAccumulatedSeconds(taskId: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const raw = sessionStorage.getItem(timerStorageKey(taskId))
    if (!raw) return 0
    const parsed = JSON.parse(raw)
    return typeof parsed.accumulatedSeconds === 'number' ? parsed.accumulatedSeconds : 0
  } catch {
    return 0
  }
}

function writePausedTimerState(taskId: string, accumulatedSeconds: number) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(
    timerStorageKey(taskId),
    JSON.stringify({ accumulatedSeconds, runStartAt: null }),
  )
  window.dispatchEvent(
    new CustomEvent(TIMER_SYNC_EVENT, {
      detail: { taskId, accumulatedSeconds, runStartAt: null },
    }),
  )
}

export type RemoteTimerState = {
  accumulatedSeconds?: number
  handedOff?: boolean
  locked?: boolean
}

/**
 * Stop a locally running timer immediately when the server freezes it on handoff,
 * then optionally align accumulated seconds from timer-state.
 */
export async function applyRemoteTimerPause(
  taskId: string,
  options: {
    sessionClosed?: boolean
    fetchTimerState?: () => Promise<RemoteTimerState | null | undefined>
  } = {},
): Promise<boolean> {
  if (typeof window === 'undefined' || !taskId) return false

  const runStartAt = readTimerRunStartAt(taskId)
  if (runStartAt == null) return false

  const liveSeconds =
    readTimerAccumulatedSeconds(taskId) + Math.max(0, Math.floor((Date.now() - runStartAt) / 1000))
  writePausedTimerState(taskId, liveSeconds)

  let accumulatedSeconds = liveSeconds
  let handedOff = Boolean(options.sessionClosed)
  try {
    const data = await options.fetchTimerState?.()
    if (data) {
      if (typeof data.accumulatedSeconds === 'number') {
        accumulatedSeconds = data.accumulatedSeconds
        writePausedTimerState(taskId, accumulatedSeconds)
      }
      handedOff = Boolean(data.handedOff || data.locked || options.sessionClosed)
    }
  } catch {
    // Keep the locally frozen value if timer-state cannot be fetched.
  }

  window.dispatchEvent(
    new CustomEvent(TIMER_REMOTE_PAUSE_EVENT, {
      detail: { taskId, accumulatedSeconds, handedOff, sessionClosed: Boolean(options.sessionClosed) },
    }),
  )
  return true
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
