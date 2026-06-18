export type LeaveDateRange = {
  startDate: Date;
  endDate: Date;
};

export const LEAVE_TYPE_FULL_DAY = 'Full Day';
export const LEAVE_TYPE_HALF_DAY = 'Half Day';
export const LEAVE_TYPE_OPTIONS = [LEAVE_TYPE_FULL_DAY, LEAVE_TYPE_HALF_DAY] as const;

export type LeaveType = (typeof LEAVE_TYPE_OPTIONS)[number];

export const HALF_DAY_SESSION_FIRST = 'First Half';
export const HALF_DAY_SESSION_SECOND = 'Second Half';
export const HALF_DAY_SESSION_OPTIONS = [HALF_DAY_SESSION_FIRST, HALF_DAY_SESSION_SECOND] as const;

export type HalfDaySession = (typeof HALF_DAY_SESSION_OPTIONS)[number];

export type LeaveOverlapCandidate = {
  id: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
  type?: string | null;
  halfDaySession?: string | null;
};

const OVERLAP_BLOCKING_STATUSES = new Set(['PENDING', 'APPROVED']);

/** True when the leave period has fully ended (end date before today). */
export function isLeaveRangeCompleted(
  endDateIso: string,
  referenceTodayIso: string = todayDateOnlyIso(),
): boolean {
  const end = endDateIso.trim();
  if (!ISO_DATE_RE.test(end)) return false;
  return end < referenceTodayIso;
}

export const DUPLICATE_LEAVE_ERROR_MESSAGE =
  'You already have a leave request for the selected date(s). Please modify or cancel the existing request instead of creating a duplicate.';

/** Parse YYYY-MM-DD as UTC midnight (date-only semantics). */
export function parseDateOnly(isoDate: string): Date {
  const trimmed = isoDate.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid date format: ${isoDate}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's calendar date as YYYY-MM-DD (UTC, matches date-only API payloads). */
export function todayDateOnlyIso(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayUtcDate(): Date {
  return parseDateOnly(todayDateOnlyIso());
}

export function normalizeLeaveStatus(status: string): string {
  return status.trim().toUpperCase();
}

export function normalizeLeaveType(type: string): LeaveType | null {
  const normalized = type.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (normalized === 'half day' || normalized === 'half') return LEAVE_TYPE_HALF_DAY;
  if (normalized === 'full day' || normalized === 'full' || normalized === 'leave') {
    return LEAVE_TYPE_FULL_DAY;
  }
  return null;
}

export function normalizeHalfDaySession(session: string | null | undefined): HalfDaySession | null {
  const normalized = String(session ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (normalized === 'first half' || normalized === 'first' || normalized === 'am' || normalized === 'morning') {
    return HALF_DAY_SESSION_FIRST;
  }
  if (normalized === 'second half' || normalized === 'second' || normalized === 'pm' || normalized === 'afternoon') {
    return HALF_DAY_SESSION_SECOND;
  }
  return null;
}

export function resolveLeaveEndDate(startDate: Date, endDate?: Date | null): Date {
  return endDate ?? startDate;
}

/** Normalize a Date (e.g. from SQL Server) to YYYY-MM-DD using UTC calendar parts. */
export function dateToDateOnlyIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Inclusive overlap on YYYY-MM-DD strings. */
export function dateRangesOverlapIso(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Inclusive range overlap: [aStart,aEnd] vs [bStart,bEnd]. */
export function dateRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return dateRangesOverlapIso(
    dateToDateOnlyIso(aStart),
    dateToDateOnlyIso(aEnd),
    dateToDateOnlyIso(bStart),
    dateToDateOnlyIso(bEnd),
  );
}

export function buildLeaveDateRange(startDateIso: string, endDateIso?: string): LeaveDateRange {
  const startDate = parseDateOnly(startDateIso);
  const endDate = endDateIso?.trim() ? parseDateOnly(endDateIso) : startDate;
  return { startDate, endDate };
}

export function calculateLeaveDurationDays(type: string, range: LeaveDateRange): number {
  const leaveType = normalizeLeaveType(type);
  if (leaveType === LEAVE_TYPE_HALF_DAY) return 0.5;

  const start = Date.UTC(
    range.startDate.getUTCFullYear(),
    range.startDate.getUTCMonth(),
    range.startDate.getUTCDate(),
  );
  const end = Date.UTC(
    range.endDate.getUTCFullYear(),
    range.endDate.getUTCMonth(),
    range.endDate.getUTCDate(),
  );
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function formatLeaveDurationLabel(days: number): string {
  return days <= 1 ? `${days} day` : `${days} days`;
}

export type LeaveDateValidationResult =
  | { ok: true; range: LeaveDateRange }
  | { ok: false; message: string };

export function validateLeaveDates(
  startDateIso: string,
  endDateIso: string | undefined,
  referenceTodayIso: string = todayDateOnlyIso(),
): LeaveDateValidationResult {
  const startNorm = startDateIso.trim();
  const endNorm = endDateIso?.trim() || startNorm;

  if (!ISO_DATE_RE.test(startNorm) || !ISO_DATE_RE.test(endNorm)) {
    return { ok: false, message: 'Dates must be valid ISO 8601 values (YYYY-MM-DD)' };
  }

  if (startNorm < referenceTodayIso) {
    return { ok: false, message: 'Leave cannot be requested for past dates' };
  }

  if (endNorm < startNorm) {
    return { ok: false, message: 'End date cannot be earlier than start date' };
  }

  let range: LeaveDateRange;
  try {
    range = buildLeaveDateRange(startNorm, endNorm);
  } catch {
    return { ok: false, message: 'Dates must be valid ISO 8601 values (YYYY-MM-DD)' };
  }

  return { ok: true, range };
}

export function findOverlappingLeave(
  existing: LeaveOverlapCandidate[],
  range: LeaveDateRange,
  excludeId?: string,
  requestedType?: string,
  requestedHalfDaySession?: string | null,
): LeaveOverlapCandidate | null {
  const rangeStart = dateToDateOnlyIso(range.startDate);
  const rangeEnd = dateToDateOnlyIso(range.endDate);
  const requestedLeaveType = normalizeLeaveType(requestedType ?? LEAVE_TYPE_FULL_DAY);
  const requestedSession = normalizeHalfDaySession(requestedHalfDaySession);

  for (const row of existing) {
    if (excludeId && row.id === excludeId) continue;
    if (!OVERLAP_BLOCKING_STATUSES.has(normalizeLeaveStatus(row.status))) continue;

    const rowStart = dateToDateOnlyIso(row.startDate);
    const rowEnd = dateToDateOnlyIso(resolveLeaveEndDate(row.startDate, row.endDate));
    if (dateRangesOverlapIso(rangeStart, rangeEnd, rowStart, rowEnd)) {
      const rowType = normalizeLeaveType(row.type ?? LEAVE_TYPE_FULL_DAY);
      const rowSession = normalizeHalfDaySession(row.halfDaySession);
      const bothHalfDaySameDate =
        requestedLeaveType === LEAVE_TYPE_HALF_DAY &&
        rowType === LEAVE_TYPE_HALF_DAY &&
        rangeStart === rangeEnd &&
        rowStart === rowEnd &&
        rangeStart === rowStart;

      if (bothHalfDaySameDate && requestedSession && rowSession && requestedSession !== rowSession) {
        continue;
      }
      return row;
    }
  }
  return null;
}

export function overlapErrorMessage(_conflict?: LeaveOverlapCandidate): string {
  return DUPLICATE_LEAVE_ERROR_MESSAGE;
}
