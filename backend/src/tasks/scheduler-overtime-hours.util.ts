export const APPROVED_OVERTIME_STATUSES = ['APPROVED', 'Approved', 'approved'] as const;

export const PENDING_OVERTIME_STATUSES = [
  'SUBMITTED',
  'APPROVED_BY_MANAGER',
  'Pending',
  'PENDING',
] as const;

type OvertimeHoursRow = {
  status?: string | null;
  approvedHours?: unknown;
  requestedHours?: unknown;
  totalHours?: unknown;
};

function hoursFromDecimal(value: unknown): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Approved OT uses approvedHours, then requested/total as fallback. */
export function approvedOvertimeHoursFromRow(row: OvertimeHoursRow): number {
  const approved = hoursFromDecimal(row.approvedHours);
  if (approved > 0) return approved;
  return hoursFromDecimal(row.requestedHours) || hoursFromDecimal(row.totalHours);
}

/** Pending OT uses requested or total hours. */
export function pendingOvertimeHoursFromRow(row: OvertimeHoursRow): number {
  return hoursFromDecimal(row.requestedHours) || hoursFromDecimal(row.totalHours);
}

function statusMatches(row: OvertimeHoursRow, allowed: readonly string[]): boolean {
  const raw = String(row.status ?? '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  return allowed.some((s) => s.toUpperCase() === upper || s === raw);
}

export function sumOvertimeHoursForStatuses(
  rows: OvertimeHoursRow[],
  allowedStatuses: readonly string[],
  pickHours: (row: OvertimeHoursRow) => number,
): number {
  const total = rows
    .filter((row) => statusMatches(row, allowedStatuses))
    .reduce((sum, row) => sum + pickHours(row), 0);
  return Math.round(total * 100) / 100;
}

export function summarizeViewerOvertimeHours(rows: OvertimeHoursRow[]) {
  return {
    myApprovedOvertimeHours: sumOvertimeHoursForStatuses(
      rows,
      APPROVED_OVERTIME_STATUSES,
      approvedOvertimeHoursFromRow,
    ),
    myPendingOvertimeHours: sumOvertimeHoursForStatuses(
      rows,
      PENDING_OVERTIME_STATUSES,
      pendingOvertimeHoursFromRow,
    ),
  };
}
