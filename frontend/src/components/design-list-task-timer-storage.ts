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

/**
 * Cache the timer clock locally and notify same-tab listeners.
 * Other tabs pick this up via the native `storage` event on localStorage.
 * Callers should only write confirmed server state (or intentional clears).
 */
export function writeTimerState(
  taskId: string,
  accumulatedSeconds: number,
  runStartAt: number | null,
  _options?: { force?: boolean },
) {
  const store = browserStorage()
  if (!store || !taskId) return
  const key = timerStorageKey(taskId)
  migrateLegacySessionKey(key)

  try {
    store.setItem(key, JSON.stringify({ accumulatedSeconds, runStartAt }))
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

export type ServerTimerState = {
  accumulatedSeconds?: number
  runStartedAt?: string | null
  pauseLog?: string | null
  handedOff?: boolean
  locked?: boolean
  sessionClosed?: boolean
  sessionId?: string | null
}

/**
 * Adopt authoritative server timer state into the local cache and notify listeners.
 * This is the only write path that should update the live clock from the network/socket.
 */
export function applyServerTimerState(
  taskId: string,
  state: ServerTimerState | null | undefined,
): TimerPersistedState {
  const empty = { accumulatedSeconds: 0, runStartAt: null as number | null }
  if (!taskId || !state) return empty

  const accumulatedSeconds =
    typeof state.accumulatedSeconds === 'number' ? Math.max(0, state.accumulatedSeconds) : 0
  let runStartAt: number | null = null
  if (!state.handedOff && state.runStartedAt) {
    const parsed = Date.parse(state.runStartedAt)
    if (!Number.isNaN(parsed)) runStartAt = parsed
  }

  writeTimerState(taskId, accumulatedSeconds, runStartAt, { force: true })

  if (typeof state.pauseLog === 'string' && state.pauseLog.trim()) {
    try {
      const parsed = JSON.parse(state.pauseLog) as PauseLogEntry[]
      if (Array.isArray(parsed)) writePauseLog(taskId, parsed)
    } catch {
      // ignore malformed pause log
    }
  }

  // Stop listeners when the server clears the run. `handedOff` is only true for real
  // handoffs — submit uses sessionClosed without handedOff and must not show that banner.
  if (state.handedOff || state.sessionClosed || state.locked) {
    window.dispatchEvent(
      new CustomEvent(TIMER_REMOTE_PAUSE_EVENT, {
        detail: {
          taskId,
          accumulatedSeconds,
          handedOff: Boolean(state.handedOff),
          sessionClosed: Boolean(state.sessionClosed),
        },
      }),
    )
  }

  return { accumulatedSeconds, runStartAt }
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

export type RemoteTimerState = ServerTimerState

/**
 * Apply a remote pause/handoff. Prefer payload fields; optionally fetch timer-state to fill gaps.
 */
export async function applyRemoteTimerPause(
  taskId: string,
  options: {
    sessionClosed?: boolean
    accumulatedSeconds?: number
    runStartedAt?: string | null
    handedOff?: boolean
    locked?: boolean
    fetchTimerState?: () => Promise<RemoteTimerState | null | undefined>
  } = {},
): Promise<boolean> {
  if (typeof window === 'undefined' || !taskId) return false

  let state: ServerTimerState = {
    accumulatedSeconds: options.accumulatedSeconds,
    runStartedAt: options.runStartedAt ?? null,
    handedOff: options.handedOff,
    locked: options.locked,
    sessionClosed: options.sessionClosed,
  }

  const needsFetch =
    typeof state.accumulatedSeconds !== 'number' ||
    (state.runStartedAt === undefined && !options.sessionClosed)

  if (needsFetch && options.fetchTimerState) {
    try {
      const data = await options.fetchTimerState()
      if (data) {
        state = {
          ...data,
          sessionClosed: Boolean(options.sessionClosed || data.sessionClosed),
          handedOff: Boolean(options.handedOff || data.handedOff),
          locked: Boolean(options.locked || data.locked || options.sessionClosed),
        }
      }
    } catch {
      // fall through with whatever we have
    }
  }

  if (typeof state.accumulatedSeconds !== 'number') {
    const local = readTimerState(taskId)
    const live =
      local.runStartAt != null
        ? local.accumulatedSeconds + Math.max(0, Math.floor((Date.now() - local.runStartAt) / 1000))
        : local.accumulatedSeconds
    state.accumulatedSeconds = live
  }

  const wasRunning = readTimerRunStartAt(taskId) != null
  state.runStartedAt = null
  state.locked = Boolean(state.locked || state.handedOff || options.sessionClosed)
  applyServerTimerState(taskId, state)
  return wasRunning || Boolean(options.sessionClosed || options.handedOff || options.locked)
}

/** First task id with a running timer in localStorage cache (optionally excluding one). */
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
 * Resolve which task has an active running clock.
 * Server id wins when present; otherwise fall back to local cache.
 * A local paused entry for the server task means the server id is stale.
 */
export function resolveActiveRunningTaskId(
  serverTaskId: string | null | undefined,
  excludeTaskId?: string,
): string | null {
  if (serverTaskId && serverTaskId !== excludeTaskId) {
    if (hasLocalTimerEntry(serverTaskId) && readTimerRunStartAt(serverTaskId) == null) {
      // Server said running but cache already shows paused — trust cache pause.
    } else {
      return serverTaskId
    }
  }

  return findRunningTimerTaskId(excludeTaskId)
}

/** Statuses where the designer may run the work timer. */
export const TIMER_ACTIVE_STATUSES = ['DESIGN_PLANNED', 'IN_PROGRESS', 'REWORK'] as const

export function isTimerLockedStatus(status: string | null | undefined): boolean {
  if (!status) return true
  return !TIMER_ACTIVE_STATUSES.includes(status as (typeof TIMER_ACTIVE_STATUSES)[number])
}
