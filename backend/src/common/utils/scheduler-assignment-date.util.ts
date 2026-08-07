/**
 * Calendar-date helpers for SchedulerAssignment rows.
 *
 * Assignments are stored by (weekStartDate Monday, dayIndex 0–6). Filtering with
 * `weekStartDate >= today` incorrectly keeps remaining days in the current week
 * when today is mid-week (e.g. Wed–Fri stay after ON_HOLD). Always derive the
 * assignment's calendar date = weekStartDate + dayIndex.
 */

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Monday (UTC) of the ISO-style week containing `date`. */
export function mondayWeekStartUtc(date: Date): Date {
  const temp = startOfUtcDay(date);
  const day = temp.getUTCDay();
  const diff = temp.getUTCDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(Date.UTC(temp.getUTCFullYear(), temp.getUTCMonth(), diff));
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart;
}

export function assignmentCalendarDate(
  weekStartDate: Date | null | undefined,
  dayIndex: number | null | undefined,
): Date | null {
  if (!weekStartDate || dayIndex == null || !Number.isFinite(Number(dayIndex))) return null;
  const d = new Date(weekStartDate);
  d.setUTCDate(d.getUTCDate() + Number(dayIndex));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function isAssignmentOnOrAfter(
  row: { weekStartDate: Date | null | undefined; dayIndex: number | null | undefined },
  fromDate: Date,
): boolean {
  const assignmentDate = assignmentCalendarDate(row.weekStartDate, row.dayIndex);
  if (!assignmentDate) return false;
  return assignmentDate.getTime() >= startOfUtcDay(fromDate).getTime();
}

/** Broad week filter so current-week mid/late days are still candidates. */
export function weekStartOnOrAfterCurrentWeek(fromDate: Date = new Date()) {
  return { weekStartDate: { gte: mondayWeekStartUtc(startOfUtcDay(fromDate)) } };
}

export function selectFutureAssignmentIds<T extends { id: string; weekStartDate: Date | null; dayIndex: number | null }>(
  rows: T[],
  fromDate: Date = new Date(),
): string[] {
  return rows.filter((row) => isAssignmentOnOrAfter(row, fromDate)).map((row) => row.id);
}
