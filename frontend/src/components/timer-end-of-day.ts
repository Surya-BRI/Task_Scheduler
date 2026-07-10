/** Local calendar date YYYY-MM-DD (browser timezone). */
export function localDateKey(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const EOD_PROMPT_HOURS = [18, 21] as const
export type EodPromptHour = (typeof EOD_PROMPT_HOURS)[number]

export const EOD_AUTO_PAUSE_MS = 30 * 60 * 1000

function eodDismissKey(taskId: string, dateKey: string, hour: EodPromptHour) {
  return `timer_eod_dismissed_${taskId}_${dateKey}_${hour}`
}

function eodContinueKey(taskId: string, dateKey: string) {
  return `timer_eod_continue_${taskId}_${dateKey}`
}

export function wasEodPromptDismissed(taskId: string, dateKey: string, hour: EodPromptHour) {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(eodDismissKey(taskId, dateKey, hour)) === '1'
}

export function markEodPromptDismissed(taskId: string, dateKey: string, hour: EodPromptHour) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(eodDismissKey(taskId, dateKey, hour), '1')
}

export function didContinueWorkingToday(taskId: string, dateKey: string) {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(eodContinueKey(taskId, dateKey)) === '1'
}

export function markContinuedWorkingToday(taskId: string, dateKey: string) {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(eodContinueKey(taskId, dateKey), '1')
}

/** Which end-of-day prompt (if any) should show right now. */
export function resolveEodPromptHour(
  taskId: string,
  now = new Date(),
): EodPromptHour | null {
  const dateKey = localDateKey(now)
  const hour = now.getHours()

  for (const promptHour of EOD_PROMPT_HOURS) {
    if (hour < promptHour) continue
    if (wasEodPromptDismissed(taskId, dateKey, promptHour)) continue
    if (promptHour === 21 && !didContinueWorkingToday(taskId, dateKey)) continue
    return promptHour
  }
  return null
}

/** Timer started on a prior calendar day while still running → overnight leak. */
export function isOvernightRunningTimer(runStartAt: number | null, now = new Date()) {
  if (!runStartAt) return false
  return localDateKey(new Date(runStartAt)) !== localDateKey(now)
}

export function formatEodPromptLabel(hour: EodPromptHour) {
  if (hour === 18) return '6:00 PM'
  if (hour === 21) return '9:00 PM'
  return `${hour}:00`
}
