export type LeaveDateRange = {
  startDate: Date;
  endDate: Date;
};

export type LeaveOverlapCandidate = {
  id: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
};

const OVERLAP_BLOCKING_STATUSES = new Set(['PENDING', 'APPROVED']);

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

export function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function normalizeLeaveStatus(status: string): string {
  return status.trim().toUpperCase();
}

export function resolveLeaveEndDate(startDate: Date, endDate?: Date | null): Date {
  return endDate ?? startDate;
}

/** Inclusive range overlap: [aStart,aEnd] vs [bStart,bEnd]. */
export function dateRangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

export function buildLeaveDateRange(startDateIso: string, endDateIso?: string): LeaveDateRange {
  const startDate = parseDateOnly(startDateIso);
  const endDate = endDateIso?.trim() ? parseDateOnly(endDateIso) : startDate;
  return { startDate, endDate };
}

export type LeaveDateValidationResult =
  | { ok: true; range: LeaveDateRange }
  | { ok: false; message: string };

export function validateLeaveDates(
  startDateIso: string,
  endDateIso: string | undefined,
  referenceToday: Date = todayUtcDate(),
): LeaveDateValidationResult {
  let range: LeaveDateRange;
  try {
    range = buildLeaveDateRange(startDateIso, endDateIso);
  } catch {
    return { ok: false, message: 'Dates must be valid ISO 8601 values (YYYY-MM-DD)' };
  }

  if (range.startDate.getTime() < referenceToday.getTime()) {
    return { ok: false, message: 'Leave cannot be requested for past dates' };
  }

  if (range.endDate.getTime() < range.startDate.getTime()) {
    return { ok: false, message: 'End date cannot be earlier than start date' };
  }

  return { ok: true, range };
}

export function findOverlappingLeave(
  existing: LeaveOverlapCandidate[],
  range: LeaveDateRange,
  excludeId?: string,
): LeaveOverlapCandidate | null {
  for (const row of existing) {
    if (excludeId && row.id === excludeId) continue;
    if (!OVERLAP_BLOCKING_STATUSES.has(normalizeLeaveStatus(row.status))) continue;

    const rowEnd = resolveLeaveEndDate(row.startDate, row.endDate);
    if (dateRangesOverlap(range.startDate, range.endDate, row.startDate, rowEnd)) {
      return row;
    }
  }
  return null;
}

export function overlapErrorMessage(conflict: LeaveOverlapCandidate): string {
  const from = conflict.startDate.toISOString().split('T')[0];
  const to = (conflict.endDate ?? conflict.startDate).toISOString().split('T')[0];
  const dates = from === to ? from : `${from} to ${to}`;
  return `Leave dates overlap an existing ${normalizeLeaveStatus(conflict.status).toLowerCase()} request (${dates})`;
}
