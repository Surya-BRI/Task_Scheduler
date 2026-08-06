/** Absolute max assignable hours per working day (matches scheduler MAX_DAILY_HOURS). */
export const MAX_DAILY_HOURS = 12;

function startOfLocalDay(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Count Mon–Fri days from `fromDate` through `deadlineDate` (inclusive).
 * Returns 0 if the deadline is before fromDate or invalid.
 */
export function countWorkingDaysUntil(deadlineDate, fromDate = new Date()) {
  const start = startOfLocalDay(fromDate);
  const end = startOfLocalDay(deadlineDate);
  if (!start || !end || end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay(); // 0 Sun … 6 Sat
    if (day !== 0 && day !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function maxHoursForDeadline(deadlineDate, fromDate = new Date()) {
  return countWorkingDaysUntil(deadlineDate, fromDate) * MAX_DAILY_HOURS;
}

/**
 * Hard-block check: estimated hours must not exceed workingDays × 12h.
 * @returns {{ ok: true } | { ok: false, message: string, workingDays: number, maxHours: number }}
 */
export function assertHoursWithinDeadline(hours, deadlineDate, fromDate = new Date()) {
  const estimated = Number(hours);
  const workingDays = countWorkingDaysUntil(deadlineDate, fromDate);
  const maxHours = workingDays * MAX_DAILY_HOURS;

  if (!Number.isFinite(estimated) || estimated <= 0) {
    return { ok: true, workingDays, maxHours };
  }

  if (estimated <= maxHours) {
    return { ok: true, workingDays, maxHours };
  }

  return {
    ok: false,
    workingDays,
    maxHours,
    message: `Estimated hours (${estimated}) exceed the maximum of ${maxHours}h for ${workingDays} working days (12h/day).`,
  };
}
