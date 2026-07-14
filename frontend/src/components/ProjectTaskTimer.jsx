'use client'

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Pause, Play, Square, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import {
  EOD_AUTO_PAUSE_MS,
  formatEodPromptLabel,
  isOvernightRunningTimer,
  localDateKey,
  markContinuedWorkingToday,
  markEodPromptDismissed,
  resolveEodPromptHour,
} from './timer-end-of-day'
import {
  TIMER_SYNC_EVENT,
  findRunningTimerTaskId,
} from './design-list-task-timer-storage'
import { useActiveRunningTaskContext } from './ActiveRunningTaskProvider'
import { ACTIVE_TIMER_BLOCKED_MESSAGE } from './use-active-running-task-id'

function saveTimerStateToDb(taskId, accumulatedSeconds, pauseLog, runStartedAt, onForbidden) {
  return apiClient
    .post(`/tasks/${taskId}/save-timer`, {
      accumulatedSeconds,
      ...(pauseLog !== undefined ? { pauseLog: JSON.stringify(pauseLog) } : {}),
      ...(runStartedAt !== undefined ? { runStartedAt } : {}),
    })
    .catch((err) => {
      if (
        runStartedAt &&
        err instanceof Error &&
        err.message.includes('currently running')
      ) {
        onForbidden?.()
        return
      }
      if (runStartedAt == null && err instanceof Error) {
        toast.error('Could not save paused timer — try again.')
      }
    })
}

const TIMER_SYNC_EVENT_LEGACY = TIMER_SYNC_EVENT

function storageKey(taskId) {
  return `design_list_task_timer_${taskId}`
}

function pauseStorageKey(taskId) {
  return `design_list_task_pauses_${taskId}`
}

function readPersisted(taskId) {
  if (typeof window === 'undefined') return { accumulatedSeconds: 0, runStartAt: null }
  try {
    const raw = sessionStorage.getItem(storageKey(taskId))
    if (!raw) return { accumulatedSeconds: 0, runStartAt: null }
    const parsed = JSON.parse(raw)
    const accumulatedSeconds =
      typeof parsed.accumulatedSeconds === 'number' ? parsed.accumulatedSeconds : 0
    const runStartAt = typeof parsed.runStartAt === 'number' ? parsed.runStartAt : null
    return { accumulatedSeconds, runStartAt }
  } catch {
    return { accumulatedSeconds: 0, runStartAt: null }
  }
}

function writePersisted(taskId, accumulatedSeconds, runStartAt) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(storageKey(taskId), JSON.stringify({ accumulatedSeconds, runStartAt }))
  window.dispatchEvent(
    new CustomEvent(TIMER_SYNC_EVENT_LEGACY, {
      detail: { taskId, accumulatedSeconds, runStartAt },
    }),
  )
}

function readPersistedPauses(taskId) {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(pauseStorageKey(taskId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function appendPause(taskId, reason, durationSeconds) {
  if (typeof window === 'undefined') return
  const existing = readPersistedPauses(taskId)
  existing.push({ reason, durationSeconds })
  sessionStorage.setItem(pauseStorageKey(taskId), JSON.stringify(existing))
}

function clearPersistedPauses(taskId) {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(pauseStorageKey(taskId))
}

const FIVE_MIN_SECONDS = 5 * 60

// Credited work (pause / submit / handoff) rounds UP to the next 5-minute step so any
// nonzero effort is never saved as 0 minutes (e.g. 3m20s → 5m). The on-screen clock
// stays exact — including seconds — so designers don't see 0 jump to 5m while working.
function roundUpTo5Min(totalSeconds) {
  const s = Math.max(0, totalSeconds)
  if (s <= 0) return 0
  return Math.ceil(s / FIVE_MIN_SECONDS) * FIVE_MIN_SECONDS
}

/** Exact clock for the live timer UI (no 5-minute rounding). */
function formatHms(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h}h ${m}m ${String(sec).padStart(2, '0')}s`
}

/** Compact exact duration for labels (assigned / OT banners) — no rounding. */
function formatHm(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${m}m`
}

function liveTotalSeconds(accumulatedSeconds, runStartAt) {
  if (!runStartAt) return accumulatedSeconds
  return accumulatedSeconds + Math.floor((Date.now() - runStartAt) / 1000)
}

export function ProjectTaskTimer({
  taskId,
  taskStatus,
  assignedHours = null,
  approvedOvertimeHours = null,
  pendingOvertimeHours = null,
  launchAutostart,
  launchPauseModal,
  launchCompleteModal,
  onConsumedLaunchFlags,
  onSubmitComplete,
  onStatusChange,
  inline = false,
}) {
  const [accumulatedSeconds, setAccumulatedSeconds] = useState(0)
  const [runStartAt, setRunStartAt] = useState(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [submittedSeconds, setSubmittedSeconds] = useState(null)
  const [, tick] = useReducer((n) => n + 1, 0)
  const [pauseReason, setPauseReason] = useState('')
  const [showPauseDropdown, setShowPauseDropdown] = useState(false)
  const pauseStartedAt = useRef(null)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [submissionMode, setSubmissionMode] = useState('file')
  const [submissionLink, setSubmissionLink] = useState('')
  const [timerHandedOff, setTimerHandedOff] = useState(false)
  const [showEndOfDayPrompt, setShowEndOfDayPrompt] = useState(false)
  const [endOfDaySlot, setEndOfDaySlot] = useState(null)
  const activeRunningContext = useActiveRunningTaskContext()
  const completeFileInputRef = useRef(null)
  const launchConsumed = useRef(false)
  const eodPromptShownAt = useRef(null)
  const eodAutoPauseTimerRef = useRef(null)
  const pauseReasonOptions = [
    'Break time',
    'Work on other project',
    'Client call',
    'Internal review/discussion',
    'Waiting for inputs',
    'System issue',
  ]

  const isLocked = !['DESIGN_PLANNED', 'IN_PROGRESS', 'REWORK'].includes(taskStatus)
  const playPauseLocked = isLocked || timerHandedOff
  const isRunning = runStartAt !== null && !playPauseLocked

  const activeRunningTaskId = activeRunningContext?.activeRunningTaskId ?? findRunningTimerTaskId()

  const isStartBlockedByOther =
    !playPauseLocked &&
    !isRunning &&
    activeRunningTaskId != null &&
    activeRunningTaskId !== String(taskId)

  useEffect(() => {
    setTimerHandedOff(false)
    const locked = !['DESIGN_PLANNED', 'IN_PROGRESS', 'REWORK'].includes(taskStatus)

    if (locked) {
      // For submitted/locked tasks show the last submitted session duration
      apiClient
        .get(`/tasks/${taskId}/submitted-session`)
        .then((data) => {
          if (data?.durationSeconds) setSubmittedSeconds(data.durationSeconds)
        })
        .catch(() => {})
        .finally(() => setIsHydrated(true))
      return
    }

    const { accumulatedSeconds: acc, runStartAt: start } = readPersisted(taskId)
    setAccumulatedSeconds(acc)
    setRunStartAt(start)

    apiClient
      .get(`/tasks/${taskId}/timer-state`)
      .then((data) => {
        if (!data) return
        if (data.handedOff || data.locked) {
          const restored = data.accumulatedSeconds ?? 0
          setTimerHandedOff(true)
          setAccumulatedSeconds(restored)
          setRunStartAt(null)
          writePersisted(taskId, restored, null)
          return
        }
        const restored = data.accumulatedSeconds ?? 0
        const restoredPauses = data.pauseLog ? JSON.parse(data.pauseLog) : []
        const restoredRunStartAt = data.runStartedAt ? Date.parse(data.runStartedAt) : null
        const hasDbRun = restoredRunStartAt != null && !Number.isNaN(restoredRunStartAt)
        if (start === null && (hasDbRun || restored > acc || (restored === 0 && restoredPauses.length > 0))) {
          setAccumulatedSeconds(restored)
          setRunStartAt(hasDbRun ? restoredRunStartAt : null)
          writePersisted(taskId, restored, hasDbRun ? restoredRunStartAt : null)
        } else if (start !== null && hasDbRun) {
          setAccumulatedSeconds(restored)
          setRunStartAt(restoredRunStartAt)
          writePersisted(taskId, restored, restoredRunStartAt)
        }
        if (restoredPauses.length > 0) {
          const existing = readPersistedPauses(taskId)
          if (existing.length === 0) {
            sessionStorage.setItem(pauseStorageKey(taskId), JSON.stringify(restoredPauses))
          }
        }
      })
      .catch(() => {})
      .finally(() => setIsHydrated(true))
  }, [taskId, taskStatus])

  useEffect(() => {
    launchConsumed.current = false
    setSubmittedSeconds(null)
  }, [taskId])

  useEffect(() => {
    if (!launchAutostart && !launchPauseModal && !launchCompleteModal) {
      launchConsumed.current = false
    }
  }, [launchAutostart, launchCompleteModal, launchPauseModal])

  useEffect(() => {
    if (!isHydrated) return
    writePersisted(taskId, accumulatedSeconds, runStartAt)
  }, [taskId, accumulatedSeconds, runStartAt, isHydrated])

  useEffect(() => {
    function syncFromStorage() {
      const { accumulatedSeconds: acc, runStartAt: start } = readPersisted(taskId)
      setAccumulatedSeconds(acc)
      setRunStartAt(start)
    }

    function onTimerSync(event) {
      if (event?.detail?.taskId !== taskId) return
      syncFromStorage()
    }

    function onStorage(event) {
      if (event.key !== storageKey(taskId)) return
      syncFromStorage()
    }

    window.addEventListener(TIMER_SYNC_EVENT_LEGACY, onTimerSync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(TIMER_SYNC_EVENT_LEGACY, onTimerSync)
      window.removeEventListener('storage', onStorage)
    }
  }, [taskId])

  useEffect(() => {
    if (!runStartAt || playPauseLocked) return undefined
    const id = window.setInterval(() => tick(), 1000)
    return () => window.clearInterval(id)
  }, [runStartAt, playPauseLocked])

  const freezeRunningClock = useCallback(() => {
    if (!runStartAt) return accumulatedSeconds
    // Keep exact elapsed on screen / in draft; 5-minute round-up applies on submit (and
    // handoff / workedHours on the backend).
    const total = liveTotalSeconds(accumulatedSeconds, runStartAt)
    setAccumulatedSeconds(total)
    setRunStartAt(null)
    writePersisted(taskId, total, null)
    return total
  }, [accumulatedSeconds, runStartAt, taskId])

  const closeEndOfDayPrompt = useCallback(() => {
    if (eodAutoPauseTimerRef.current) {
      window.clearTimeout(eodAutoPauseTimerRef.current)
      eodAutoPauseTimerRef.current = null
    }
    eodPromptShownAt.current = null
    setShowEndOfDayPrompt(false)
    setEndOfDaySlot(null)
  }, [])

  const pauseForEndOfDay = useCallback(
    (pauseReason, slot) => {
      const frozen = freezeRunningClock()
      if (pauseReason) {
        appendPause(taskId, pauseReason, 0)
      }
      const updatedPauses = readPersistedPauses(taskId)
      saveTimerStateToDb(taskId, frozen, updatedPauses, null)
      if (slot != null) {
        markEodPromptDismissed(taskId, localDateKey(), slot)
      }
      closeEndOfDayPrompt()
      toast.info(pauseReason ? 'Timer paused for today.' : 'Timer paused.')
    },
    [closeEndOfDayPrompt, freezeRunningClock, taskId],
  )

  const handleEndOfDayContinue = useCallback(() => {
    if (endOfDaySlot == null) {
      closeEndOfDayPrompt()
      return
    }
    const dateKey = localDateKey()
    markEodPromptDismissed(taskId, dateKey, endOfDaySlot)
    if (endOfDaySlot === 18) {
      markContinuedWorkingToday(taskId, dateKey)
    }
    closeEndOfDayPrompt()
    toast.success('Timer still running.')
  }, [closeEndOfDayPrompt, endOfDaySlot, taskId])

  const handleEndOfDayPause = useCallback(() => {
    pauseForEndOfDay('End of day', endOfDaySlot)
  }, [endOfDaySlot, pauseForEndOfDay])

  useEffect(() => {
    if (!isHydrated || playPauseLocked || !isRunning) return undefined

    function checkEndOfDay() {
      const { accumulatedSeconds: acc, runStartAt: start } = readPersisted(taskId)
      if (!start) return

      if (isOvernightRunningTimer(start)) {
        const total = liveTotalSeconds(acc, start)
        setAccumulatedSeconds(total)
        setRunStartAt(null)
        writePersisted(taskId, total, null)
        appendPause(taskId, 'Overnight — timer paused automatically', 0)
        saveTimerStateToDb(taskId, total, readPersistedPauses(taskId), null)
        closeEndOfDayPrompt()
        toast.warning('Timer was still running from yesterday and has been paused.')
        return
      }

      if (showEndOfDayPrompt) return

      const promptHour = resolveEodPromptHour(taskId)
      if (promptHour == null) return

      eodPromptShownAt.current = Date.now()
      setEndOfDaySlot(promptHour)
      setShowEndOfDayPrompt(true)
    }

    checkEndOfDay()
    const id = window.setInterval(checkEndOfDay, 60_000)
    return () => window.clearInterval(id)
  }, [closeEndOfDayPrompt, isHydrated, isRunning, playPauseLocked, showEndOfDayPrompt, taskId])

  useEffect(() => {
    if (!showEndOfDayPrompt || endOfDaySlot == null) return undefined

    eodAutoPauseTimerRef.current = window.setTimeout(() => {
      pauseForEndOfDay('End of day — no response (auto)', endOfDaySlot)
      toast.warning('Timer paused automatically — no response to end-of-day check.')
    }, EOD_AUTO_PAUSE_MS)

    document.body.style.overflow = 'hidden'
    return () => {
      if (eodAutoPauseTimerRef.current) {
        window.clearTimeout(eodAutoPauseTimerRef.current)
        eodAutoPauseTimerRef.current = null
      }
      if (!showCompleteModal && !showSubmitConfirm) {
        document.body.style.overflow = ''
      }
    }
  }, [endOfDaySlot, pauseForEndOfDay, showCompleteModal, showEndOfDayPrompt, showSubmitConfirm])

  useEffect(() => {
    if (launchConsumed.current) return
    if (!launchAutostart && !launchPauseModal && !launchCompleteModal) return
    launchConsumed.current = true

    const { accumulatedSeconds: acc0, runStartAt: start0 } = readPersisted(taskId)
    const totalNow = liveTotalSeconds(acc0, start0)

    if (launchAutostart) {
      const otherRunning = findRunningTimerTaskId(taskId)
      if (otherRunning) {
        toast.warning(ACTIVE_TIMER_BLOCKED_MESSAGE)
      } else if (!start0) {
        setAccumulatedSeconds(acc0)
        setRunStartAt(Date.now())
      }
    }

    if (launchPauseModal && start0) {
      setAccumulatedSeconds(totalNow)
      setRunStartAt(null)
      setShowPauseDropdown(true)
    }

    if (launchCompleteModal && totalNow > 0) {
      setAccumulatedSeconds(totalNow)
      setRunStartAt(null)
      setShowCompleteModal(true)
    }

    queueMicrotask(() => onConsumedLaunchFlags?.())
  }, [
    launchAutostart,
    launchCompleteModal,
    launchPauseModal,
    onConsumedLaunchFlags,
    taskId,
  ])

  useEffect(() => {
    if (!showCompleteModal && !showSubmitConfirm) return undefined
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (showSubmitConfirm) {
        setShowSubmitConfirm(false)
        return
      }
      if (showCompleteModal) {
        setSelectedFiles([])
        setShowCompleteModal(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [showCompleteModal, showSubmitConfirm])

  const handleStart = () => {
    if (isRunning || playPauseLocked) return
    if (isStartBlockedByOther) {
      toast.warning(ACTIVE_TIMER_BLOCKED_MESSAGE)
      return
    }
    const startedAt = Date.now()
    setRunStartAt(startedAt)
    writePersisted(taskId, accumulatedSeconds, startedAt)
    saveTimerStateToDb(taskId, accumulatedSeconds, undefined, new Date(startedAt).toISOString(), () => {
      setRunStartAt(null)
      writePersisted(taskId, accumulatedSeconds, null)
      toast.warning(ACTIVE_TIMER_BLOCKED_MESSAGE)
    })
    // Move task to IN_PROGRESS so it reflects active work
    apiClient.patch(`/tasks/${taskId}/status`, { status: 'IN_PROGRESS' })
      .catch(() => {})
      .finally(() => { onStatusChange?.() })
  }

  const handlePauseClick = () => {
    if (!isRunning) return
    const frozen = freezeRunningClock()
    pauseStartedAt.current = Date.now()
    setShowPauseDropdown(true)
    saveTimerStateToDb(taskId, frozen, undefined, null)
  }

  const applyPauseReason = () => {
    const reason = pauseReason.trim()
    if (!reason) return
    const durationSeconds = pauseStartedAt.current
      ? Math.floor((Date.now() - pauseStartedAt.current) / 1000)
      : 0
    appendPause(taskId, reason, durationSeconds)
    pauseStartedAt.current = null
    setPauseReason('')
    setShowPauseDropdown(false)
    const updatedPauses = readPersistedPauses(taskId)
    saveTimerStateToDb(taskId, accumulatedSeconds, updatedPauses, null)
  }

  const cancelPauseReason = () => {
    pauseStartedAt.current = null
    setPauseReason('')
    setShowPauseDropdown(false)
    const resumedAt = Date.now()
    setRunStartAt(resumedAt)
    writePersisted(taskId, accumulatedSeconds, resumedAt)
    saveTimerStateToDb(taskId, accumulatedSeconds, undefined, new Date(resumedAt).toISOString())
  }

  const handleStopClick = () => {
    const total = liveTotalSeconds(accumulatedSeconds, runStartAt)
    if (total < 1) return
    freezeRunningClock()
    setShowCompleteModal(true)
  }

  const [submitting, setSubmitting] = useState(false)

  const submitComplete = async () => {
    const hasFiles = selectedFiles.length > 0
    const hasLink = submissionLink.trim().length > 0
    if (!hasFiles && !hasLink) return

    const pauseLog = readPersistedPauses(taskId)
    const formData = new FormData()
    formData.append('durationSeconds', String(roundUpTo5Min(displaySeconds)))
    if (hasLink) formData.append('submissionLink', submissionLink.trim())
    if (pauseLog.length) formData.append('pauseLog', JSON.stringify(pauseLog))
    selectedFiles.forEach((f) => formData.append('files', f))

    setSubmitting(true)
    try {
      await apiClient.post(`/tasks/${taskId}/submit-work`, formData)
      // Reset timer + clear pause log
      writePersisted(taskId, 0, null)
      clearPersistedPauses(taskId)
      setAccumulatedSeconds(0)
      setRunStartAt(null)
      setShowPauseDropdown(false)
      setPauseReason('')
      setSelectedFiles([])
      setSubmissionMode('file')
      setSubmissionLink('')
      setShowSubmitConfirm(false)
      setShowCompleteModal(false)
      onSubmitComplete?.()
    } catch (err) {
      alert(err?.message || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const closeCompleteModal = () => {
    setShowSubmitConfirm(false)
    setSelectedFiles([])
    setSubmissionMode('file')
    setSubmissionLink('')
    setShowCompleteModal(false)
  }

  const onCompleteFileChange = (e) => {
    const next = Array.from(e.target.files || [])
    if (!next.length) return
    setSelectedFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`))
      const merged = [...prev]
      for (const f of next) {
        const k = `${f.name}-${f.size}-${f.lastModified}`
        if (!seen.has(k)) {
          seen.add(k)
          merged.push(f)
        }
      }
      return merged
    })
    e.target.value = ''
  }

  const removeSelectedFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const openCompleteFilePicker = () => {
    completeFileInputRef.current?.click()
  }

  const requestSubmitReview = () => {
    const hasFiles = selectedFiles.length > 0
    const hasLink = submissionLink.trim().length > 0
    if (!hasFiles && !hasLink) return
    setShowSubmitConfirm(true)
  }

  const displaySeconds = isLocked
    ? (submittedSeconds ?? accumulatedSeconds)
    : liveTotalSeconds(accumulatedSeconds, runStartAt)

  const assignedSeconds = assignedHours != null && Number(assignedHours) > 0
    ? Math.round(Number(assignedHours) * 3600)
    : null
  const isOverAssigned = assignedSeconds != null && displaySeconds > assignedSeconds
  const excessSeconds = isOverAssigned ? displaySeconds - assignedSeconds : 0
  const approvedOtSeconds =
    approvedOvertimeHours != null && Number(approvedOvertimeHours) > 0
      ? Math.round(Number(approvedOvertimeHours) * 3600)
      : 0
  const pendingOtSeconds =
    pendingOvertimeHours != null && Number(pendingOvertimeHours) > 0
      ? Math.round(Number(pendingOvertimeHours) * 3600)
      : 0
  const uncoveredExcessSeconds = Math.max(0, excessSeconds - approvedOtSeconds)
  const overtimeRequestHref = `/designer/requests?taskId=${encodeURIComponent(taskId)}#overtime`
  const approvedOtCoversExcess = isOverAssigned && uncoveredExcessSeconds <= 0 && approvedOtSeconds > 0

  const controlBtn = inline
    ? 'grid h-5 w-5 shrink-0 place-items-center rounded transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed'
    : 'grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className={inline ? '' : 'mt-4 border-t border-slate-200 pt-4'}>
      <div className={inline ? 'flex items-center justify-end' : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4'}>
        {inline ? null : <span className="text-sm font-semibold tracking-tight text-blue-600">TIMER:</span>}
        {timerHandedOff && !inline ? (
          <span className="text-xs text-amber-700">Your slice was handed off — timer stopped. You can still submit logged work.</span>
        ) : null}
        {uncoveredExcessSeconds > 0 && !timerHandedOff && !inline ? (
          <span className="text-xs text-amber-700">
            Logged time exceeds assigned ({formatHm(assignedSeconds)} assigned, +{formatHm(uncoveredExcessSeconds)} over approved OT).
            {' '}
            <a href={overtimeRequestHref} className="font-semibold underline hover:text-amber-900">
              Submit overtime request
            </a>
          </span>
        ) : null}
        {approvedOtCoversExcess && !timerHandedOff && !inline ? (
          <span className="text-xs text-emerald-700">
            Approved overtime covers the extra time logged on this task today.
          </span>
        ) : null}
        {isOverAssigned && pendingOtSeconds > 0 && uncoveredExcessSeconds > 0 && !timerHandedOff && !inline ? (
          <span className="text-xs text-blue-700">
            Overtime request pending HOD approval ({formatHm(pendingOtSeconds)} requested).
          </span>
        ) : null}

        <div className={inline ? 'relative flex items-center gap-1' : 'relative flex flex-wrap items-center gap-1.5 sm:justify-end'}>
          <div className={inline
            ? 'flex min-w-[5.75rem] items-center justify-center rounded px-1 py-0.5'
            : 'flex min-w-[8.25rem] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm ring-1 ring-slate-900/5 sm:min-w-[8.75rem]'}>
            <span className={inline
              ? 'font-mono text-[11px] font-semibold tabular-nums tracking-tight text-slate-700'
              : 'font-mono text-sm font-medium tabular-nums tracking-tight text-slate-900'}>
              {formatHms(displaySeconds)}
            </span>
          </div>
          <>
            <button
              type="button"
              title={isStartBlockedByOther ? ACTIVE_TIMER_BLOCKED_MESSAGE : 'Start'}
              onClick={handleStart}
              disabled={isRunning || playPauseLocked}
              className={`${controlBtn} ${inline ? 'text-emerald-500 hover:text-emerald-600 focus-visible:ring-emerald-300 disabled:opacity-30' : 'bg-emerald-500 hover:bg-emerald-600 focus-visible:ring-emerald-400'} ${isStartBlockedByOther ? 'opacity-30 cursor-not-allowed' : ''}`}
            >
              <Play className={inline ? 'h-3 w-3 fill-current' : 'h-4 w-4 fill-current'} aria-hidden />
            </button>
            <button
              type="button"
              title="Pause"
              onClick={handlePauseClick}
              disabled={!isRunning || playPauseLocked}
              className={`${controlBtn} ${inline ? 'text-amber-400 hover:text-amber-500 focus-visible:ring-amber-200 disabled:opacity-30' : 'bg-amber-400 hover:bg-amber-500 focus-visible:ring-amber-300'}`}
            >
              <Pause className={inline ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden />
            </button>
            <button
              type="button"
              title="Stop"
              onClick={handleStopClick}
              disabled={displaySeconds < 1 || isLocked}
              className={`${controlBtn} ${inline ? 'text-red-600 hover:text-red-700 focus-visible:ring-red-300 disabled:opacity-30' : 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-400'}`}
            >
              <Square className={inline ? 'h-3 w-3 fill-current' : 'h-3.5 w-3.5 fill-current'} aria-hidden />
            </button>
          </>
          {showPauseDropdown ? (
            <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[min(92vw,360px)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl ring-1 ring-slate-900/5">
              <div className="flex flex-col gap-2">
                <select
                  value={pauseReason ?? ''}
                  onChange={(e) => setPauseReason(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">Select reason for pause</option>
                  {pauseReasonOptions.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={cancelPauseReason}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyPauseReason}
                    disabled={!pauseReason.trim()}
                    className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {showCompleteModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            aria-label="Close dialog"
            onClick={closeCompleteModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-completion-title"
            className="ui-surface relative z-10 w-full max-w-md overflow-hidden shadow-xl ring-1 ring-slate-900/5"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                  <Square className="h-4 w-4 fill-current opacity-90" aria-hidden />
                </span>
                <div>
                  <h2 id="task-completion-title" className="text-base font-semibold tracking-tight text-slate-900">
                    Task completion
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-600">Submit files for review to finish this session.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCompleteModal}
                className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submission option</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSubmissionMode('file')}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      submissionMode === 'file'
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Select document
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmissionMode('link')}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      submissionMode === 'link'
                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Add link
                  </button>
                </div>
              </div>

              {submissionMode === 'file' ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">File submission</p>
                  <input
                    ref={completeFileInputRef}
                    type="file"
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    onChange={onCompleteFileChange}
                  />
                  <button
                    type="button"
                    onClick={openCompleteFilePicker}
                    className="ui-select-trigger mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
                  >
                    Select files
                  </button>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Opens your file explorer. You can choose multiple files; use Select again to add more.
                  </p>
                  {selectedFiles.length > 0 ? (
                    <ul className="mt-3 max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/80 p-2">
                      {selectedFiles.map((file, i) => (
                        <li
                          key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
                          className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5 text-xs text-slate-800 shadow-sm ring-1 ring-slate-900/5"
                        >
                          <span className="min-w-0 truncate font-medium" title={file.name}>
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeSelectedFile(i)}
                            className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            aria-label={`Remove ${file.name}`}
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Link submission</p>
                  <input
                    key={showCompleteModal ? 'link-open' : 'link-closed'}
                    type="url"
                    defaultValue={submissionLink ?? ''}
                    onChange={(e) => setSubmissionLink(e.target.value)}
                    placeholder="Paste OneDrive or any shareable link"
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4">
              <button
                type="button"
                onClick={closeCompleteModal}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Later
              </button>
              <button
                type="button"
                onClick={requestSubmitReview}
                disabled={selectedFiles.length < 1 && submissionLink.trim().length < 1}
                className="rounded-lg border border-blue-200 bg-blue-50 px-5 py-2 text-sm font-semibold text-blue-800 shadow-sm transition hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEndOfDayPrompt && endOfDaySlot != null ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="eod-prompt-title"
            className="ui-surface relative z-10 w-full max-w-md overflow-hidden shadow-xl ring-1 ring-slate-900/5"
          >
            <div className="border-b border-slate-200 bg-gradient-to-b from-amber-50/80 to-white px-5 py-4">
              <h2 id="eod-prompt-title" className="text-base font-semibold text-slate-900">
                Still working?
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                It&apos;s after {formatEodPromptLabel(endOfDaySlot)} and your timer is still running.
                {approvedOtCoversExcess
                  ? ' You are over assigned hours — approved overtime covers the extra time today.'
                  : isOverAssigned || pendingOtSeconds > 0
                    ? ' You are over assigned hours — that is fine if you are on approved overtime.'
                    : ' If you are done for today, pause now so logged time stays accurate.'}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                If you do not respond within 30 minutes, the timer will pause automatically.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={handleEndOfDayPause}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Pause for today
              </button>
              <button
                type="button"
                onClick={handleEndOfDayContinue}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
              >
                Yes, still working
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSubmitConfirm ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Go back"
            onClick={() => setShowSubmitConfirm(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-confirm-title"
            className="ui-surface relative z-10 w-full max-w-md overflow-hidden shadow-xl ring-1 ring-slate-900/5"
          >
            <div className="border-b border-slate-200 bg-gradient-to-b from-amber-50/80 to-white px-5 py-4">
              <h2 id="submit-confirm-title" className="text-base font-semibold text-slate-900">
                Submit this work?
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Please confirm submission for review. This will stop the current timer session and keep the stopped duration visible.
              </p>
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto border-b border-slate-100 px-5 py-3 text-sm text-slate-800">
              {selectedFiles.map((file, i) => (
                <li key={`confirm-${file.name}-${i}`} className="truncate rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs">
                  {file.name}
                </li>
              ))}
              {submissionLink.trim() ? (
                <li className="break-all rounded-md bg-slate-50 px-2 py-1.5 font-mono text-xs">{submissionLink.trim()}</li>
              ) : null}
            </ul>
            <div className="flex flex-col-reverse gap-2 bg-slate-50/80 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitConfirm(false)}
                disabled={submitting}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={() => void submitComplete()}
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting…' : 'Yes, submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
