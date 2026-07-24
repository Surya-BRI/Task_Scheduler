export const DESIGN_LIST_TIMER_STORAGE_PREFIX = 'design_list_task_timer_'
export const DESIGN_LIST_PAUSE_STORAGE_PREFIX = 'design_list_task_pauses_'
export const DESIGN_LIST_TASK_LIFECYCLE_PREFIX = 'design_list_task_lifecycle_'

export const TIMER_SYNC_EVENT = 'design-list-task-timer-sync'
/** Fired after a server-side handoff pauses a running timer in this browser tab. */
export const TIMER_REMOTE_PAUSE_EVENT = 'design-list-task-timer-remote-pause'
/** Fired when task status / submit / hold changes so other tabs can lock or refresh. */
export const TIMER_LIFECYCLE_EVENT = 'design-list-task-lifecycle-sync'

export function timerStorageKey(taskId: string) {
  return `${DESIGN_LIST_TIMER_STORAGE_PREFIX}${taskId}`
}

export function pauseStorageKey(taskId: string) {
  return `${DESIGN_LIST_PAUSE_STORAGE_PREFIX}${taskId}`
}

export function lifecycleStorageKey(taskId: string) {
  return `${DESIGN_LIST_TASK_LIFECYCLE_PREFIX}${taskId}`
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** One-time move from legacy per-tab sessionStorage → shared localStorage. */
function migrateLegacySessionKey(key: string) {
  if (typeof window === 'undefined') return
  try {
    const legacy = sessionStorage.getItem(key)
    if (legacy == null) return
    if (localStorage.getItem(key) == null) {
      localStorage.setItem(key, legacy)
    }
    sessionStorage.removeItem(key)
  } catch {
    // ignore quota / privacy mode
  }
}

export type TimerPersistedState = {
  accumulatedSeconds: number
  runStartAt: number | null
}

export function readTimerState(taskId: string): TimerPersistedState {
  const empty = { accumulatedSeconds: 0, runStartAt: null as number | null }
  const store = browserStorage()
  if (!store || !taskId) return empty
  const key = timerStorageKey(taskId)
  migrateLegacySessionKey(key)
  try {
    const raw = store.getItem(key)
    if (!raw) return empty
    const parsed = JSON.parse(raw)
    return {
      accumulatedSeconds:
        typeof parsed.accumulatedSeconds === 'number' ? parsed.accumulatedSeconds : 0,
      runStartAt: typeof parsed.runStartAt === 'number' ? parsed.runStartAt : null,
    }
  } catch {
    return empty
  }
}

export function readTimerRunStartAt(taskId: string): number | null {
  return readTimerState(taskId).runStartAt
}

function readTimerAccumulatedSeconds(taskId: string): number {
  return readTimerState(taskId).accumulatedSeconds
}

/**
 * Persist timer clock and notify same-tab listeners.
 * Other tabs pick this up via the native `storage` event on localStorage.
 */
export function writeTimerState(
  taskId: string,
  accumulatedSeconds: number,
  runStartAt: number | null,
) {
  const store = browserStorage()
  if (!store || !taskId) return
  const key = timerStorageKey(taskId)
  migrateLegacySessionKey(key)
  try {
    store.setItem(key, JSON.stringify({ accumulatedSeconds, runStartAt }))
    // Drop any leftover session copy so this tab doesn't re-migrate stale data.
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent(TIMER_SYNC_EVENT, {
      detail: { taskId, accumulatedSeconds, runStartAt },
    }),
  )
}

function writePausedTimerState(taskId: string, accumulatedSeconds: number) {
  writeTimerState(taskId, accumulatedSeconds, null)
}

export type PauseLogEntry = { reason: string; durationSeconds: number }

export function readPauseLog(taskId: string): PauseLogEntry[] {
  const store = browserStorage()
  if (!store || !taskId) return []
  const key = pauseStorageKey(taskId)
  migrateLegacySessionKey(key)
  try {
    const raw = store.getItem(key)
    return raw ? (JSON.parse(raw) as PauseLogEntry[]) : []
  } catch {
    return []
  }
}

export function writePauseLog(taskId: string, entries: PauseLogEntry[]) {
  const store = browserStorage()
  if (!store || !taskId) return
  const key = pauseStorageKey(taskId)
  try {
    store.setItem(key, JSON.stringify(entries))
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function appendPauseLog(taskId: string, reason: string, durationSeconds: number) {
  if (!taskId) return
  const existing = readPauseLog(taskId)
  existing.push({ reason, durationSeconds })
  writePauseLog(taskId, existing)
}

export function clearPauseLog(taskId: string) {
  const store = browserStorage()
  if (!store || !taskId) return
  const key = pauseStorageKey(taskId)
  try {
    store.removeItem(key)
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export type TaskLifecyclePayload = {
  status?: string | null
  action?: string | null
  updatedAt?: number
}

/**
 * Broadcast task lifecycle (hold / submit / status) across tabs via localStorage.
 */
export function writeTaskLifecycleSync(taskId: string, payload: TaskLifecyclePayload) {
  const store = browserStorage()
  if (!store || !taskId) return
  const key = lifecycleStorageKey(taskId)
  const body = {
    status: payload.status ?? null,
    action: payload.action ?? null,
    updatedAt: Date.now(),
  }
  try {
    store.setItem(key, JSON.stringify(body))
  } catch {
    // ignore
  }
  window.dispatchEvent(
    new CustomEvent(TIMER_LIFECYCLE_EVENT, {
      detail: { taskId, ...body },
    }),
  )
}

export function readTaskLifecycleSync(taskId: string): TaskLifecyclePayload | null {
  const store = browserStorage()
  if (!store || !taskId) return null
  try {
    const raw = store.getItem(lifecycleStorageKey(taskId))
    if (!raw) return null
    return JSON.parse(raw) as TaskLifecyclePayload
  } catch {
    return null
  }
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

/** First task id with a running timer in localStorage (optionally excluding one). */
export function findRunningTimerTaskId(excludeTaskId?: string): string | null {
  const store = browserStorage()
  if (!store) return null
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i)
    if (!key?.startsWith(DESIGN_LIST_TIMER_STORAGE_PREFIX)) continue
    const taskId = key.slice(DESIGN_LIST_TIMER_STORAGE_PREFIX.length)
    if (!taskId || (excludeTaskId && taskId === excludeTaskId)) continue
    migrateLegacySessionKey(key)
    if (readTimerRunStartAt(taskId) != null) return taskId
  }
  // Also scan sessionStorage leftovers not yet migrated.
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (!key?.startsWith(DESIGN_LIST_TIMER_STORAGE_PREFIX)) continue
      const taskId = key.slice(DESIGN_LIST_TIMER_STORAGE_PREFIX.length)
      if (!taskId || (excludeTaskId && taskId === excludeTaskId)) continue
      migrateLegacySessionKey(key)
      if (readTimerRunStartAt(taskId) != null) return taskId
    }
  } catch {
    // ignore
  }
  return null
}

/** True when this task has timer state in storage (running or paused). */
export function hasLocalTimerEntry(taskId: string): boolean {
  const store = browserStorage()
  if (!store || !taskId) return false
  const key = timerStorageKey(taskId)
  migrateLegacySessionKey(key)
  return store.getItem(key) != null
}

/**
 * Resolve which task (if any) has an active running clock for this designer.
 * Local storage wins; stale server state after pause is ignored.
 */
export function resolveActiveRunningTaskId(
  serverTaskId: string | null | undefined,
  excludeTaskId?: string,
): string | null {
  const local = findRunningTimerTaskId(excludeTaskId)
  if (local) return local

  if (!serverTaskId || serverTaskId === excludeTaskId) return null

  if (hasLocalTimerEntry(serverTaskId) && readTimerRunStartAt(serverTaskId) == null) {
    return null
  }

  return serverTaskId
}

/** Statuses where the designer may run the work timer. */
export const TIMER_ACTIVE_STATUSES = ['DESIGN_PLANNED', 'IN_PROGRESS', 'REWORK'] as const

export function isTimerLockedStatus(status: string | null | undefined): boolean {
  if (!status) return true
  return !TIMER_ACTIVE_STATUSES.includes(status as (typeof TIMER_ACTIVE_STATUSES)[number])
}
