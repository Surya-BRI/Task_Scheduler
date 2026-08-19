/** Absolute max assignable hours per working day (matches frontend MAX_DAILY_HOURS). */
export const MAX_DAILY_HOURS = 12;

function startOfLocalDay(date: Date | string): Date | null {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Count calendar days from `fromDate` through `deadlineDate` (inclusive).
 * Sat/Sun count the same as Mon–Fri (scheduler weekends are open working days).
 * Returns 0 if the deadline is before fromDate or invalid.
 */
export function countWorkingDaysUntil(
  deadlineDate: Date | string,
  fromDate: Date | string = new Date(),
): number {
  const start = startOfLocalDay(fromDate);
  const end = startOfLocalDay(deadlineDate);
  if (!start || !end || end < start) return 0;

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
}

export function maxHoursForDeadline(
  deadlineDate: Date | string,
  fromDate: Date | string = new Date(),
): number {
  return countWorkingDaysUntil(deadlineDate, fromDate) * MAX_DAILY_HOURS;
}

export type HoursDeadlineCheck =
  | { ok: true; workingDays: number; maxHours: number }
  | { ok: false; message: string; workingDays: number; maxHours: number };

/**
 * Hard-block check: estimated hours must not exceed workingDays × 12h.
 * Same rule used by Sales task creation on the frontend.
 */
export function assertHoursWithinDeadline(
  hours: number,
  deadlineDate: Date | string,
  fromDate: Date | string = new Date(),
): HoursDeadlineCheck {
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
