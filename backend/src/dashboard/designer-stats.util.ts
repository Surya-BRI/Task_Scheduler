/** Closed / client-final — keep in sync with frontend designer-task-stats.util.js */
export const CLOSED_TASK_STATUSES = new Set(['CLIENT_ACCEPTED', 'CLIENT_REJECTED']);

export function normalizeTaskStatus(status?: string | null): string {
  return String(status ?? '').trim().toUpperCase();
}

export function getTaskCompletionDate(task: {
  status?: string | null;
  completedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
}): Date | null {
  if (task?.completedAt) {
    const completedAt = new Date(task.completedAt);
    if (!Number.isNaN(completedAt.getTime())) return completedAt;
  }
  if (!CLOSED_TASK_STATUSES.has(normalizeTaskStatus(task?.status))) return null;
  const fallback = new Date(task?.updatedAt ?? task?.createdAt ?? 0);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function startOfIsoWeekLocal(dateLike: Date): Date {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}

function startOfDay(dateLike: Date): Date {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateLike: Date): Date {
  const d = new Date(dateLike);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toPositiveHours(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/** Same as frontend resolveAssignmentScheduledHours. */
export function resolveAssignmentScheduledHours(row: {
  scheduledHours?: unknown;
  assignedHours?: unknown;
  approvedOvertimeHours?: unknown;
}): number {
  if (row.scheduledHours != null && row.scheduledHours !== '') {
    return toPositiveHours(row.scheduledHours);
  }
  const assignedHours = toPositiveHours(row.assignedHours);
  const approvedOvertimeHours = toPositiveHours(row.approvedOvertimeHours);
  return Math.max(assignedHours - approvedOvertimeHours, 0);
}

export type DesignerTaskStatRow = {
  status?: string | null;
  completedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

/**
 * Monthly / weekly closed counts + completion score.
 * Matches Requests StatsBar + DesignerDashboard computeDesignerTaskStats overrides.
 */
export function computeDesignerTaskBarStats(
  tasks: DesignerTaskStatRow[],
  options: { now?: Date; viewWeekStart?: Date; viewWeekEnd?: Date } = {},
): { monthlyTaskCount: number; weeklyCompletedCount: number; score: number } {
  const now = options.now ?? new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { monthlyTaskCount: 0, weeklyCompletedCount: 0, score: 0 };
  }

  let closedCount = 0;
  let monthlyTaskCount = 0;
  let weeklyCompletedCount = 0;

  const weekStart = options.viewWeekStart ? startOfDay(options.viewWeekStart) : null;
  const weekEnd = options.viewWeekEnd ? endOfDay(options.viewWeekEnd) : null;

  for (const task of tasks) {
    const status = normalizeTaskStatus(task.status);
    if (!CLOSED_TASK_STATUSES.has(status)) continue;
    closedCount += 1;
    const closedAt = getTaskCompletionDate(task);
    if (!closedAt) continue;
    if (closedAt.getMonth() === currentMonth && closedAt.getFullYear() === currentYear) {
      monthlyTaskCount += 1;
    }
    if (weekStart && weekEnd && closedAt >= weekStart && closedAt <= weekEnd) {
      weeklyCompletedCount += 1;
    }
  }

  const score = Math.round((closedCount / tasks.length) * 100);
  return { monthlyTaskCount, weeklyCompletedCount, score };
}

export type DesignerAssignmentStatRow = {
  dayIndex: number;
  assignedHours?: unknown;
  scheduledHours?: unknown;
  approvedOvertimeHours?: unknown;
  leaveHours?: unknown;
  regularizationHours?: unknown;
  requestType?: string | null;
};

/**
 * Week slot/hours/work-till for Mon–Fri — mirrors live-schedule-from-assignments StatsBar fields.
 */
export function computeDesignerWeekWorkloadStats(
  rows: DesignerAssignmentStatRow[],
  weekDates: Date[],
): {
  workLoad: { tasks: number; hours: number };
  workTill: { label: string; hours: number };
  lastWorkDayIndex: number | null;
} {
  const dayHours = new Map<number, number>();
  let slots = 0;
  let totalHours = 0;

  for (const row of rows) {
    const dayIndex = Number(row.dayIndex);
    if (!Number.isFinite(dayIndex) || dayIndex < 0 || dayIndex > 4) continue;

    let hours = 0;
    if (row.requestType === 'LEAVE') {
      hours = toPositiveHours(row.leaveHours ?? row.scheduledHours ?? row.assignedHours);
    } else if (row.requestType === 'REGULARIZATION') {
      hours = toPositiveHours(row.regularizationHours ?? row.scheduledHours ?? row.assignedHours);
    } else {
      const regular = resolveAssignmentScheduledHours(row);
      const ot = toPositiveHours(row.approvedOvertimeHours);
      hours = regular + ot;
      // OT may appear as a separate visual slot in FE; count one slot per row here.
    }
    if (!hours) continue;
    slots += 1;
    totalHours += hours;
    dayHours.set(dayIndex, (dayHours.get(dayIndex) ?? 0) + hours);
  }

  let lastWorkDayIndex: number | null = null;
  let lastWorkDayHours = 0;
  for (let d = 0; d <= 4; d += 1) {
    const h = dayHours.get(d) ?? 0;
    if (h > 0) {
      lastWorkDayIndex = d;
      lastWorkDayHours = h;
    }
  }

  const workTillDate =
    lastWorkDayIndex != null && weekDates[lastWorkDayIndex]
      ? weekDates[lastWorkDayIndex]
      : null;

  return {
    workLoad: {
      tasks: slots,
      hours: Math.round(totalHours * 100) / 100,
    },
    workTill: {
      label: formatWorkTillLabel(workTillDate) ?? '-',
      hours: Math.round(lastWorkDayHours * 100) / 100,
    },
    lastWorkDayIndex,
  };
}

export function formatWorkTillLabel(date: Date | null | undefined): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const n = d.getDate();
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  const ordinal = n + (s[(v - 20) % 10] || s[v] || s[0]);
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} ${ordinal}`;
}

export function parseWeekStartLocal(weekStart: string): { weekStartDate: Date; weekDates: Date[] } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(weekStart ?? '').trim());
  if (!m) {
    const monday = startOfIsoWeekLocal(new Date());
    return {
      weekStartDate: monday,
      weekDates: Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
      }),
    };
  }
  const weekStartDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(weekStartDate.getDate() + i);
    return d;
  });
  return { weekStartDate, weekDates };
}

export function isoWeekRangeFromWeekStart(weekStartDate: Date): { viewWeekStart: Date; viewWeekEnd: Date } {
  const viewWeekStart = startOfDay(weekStartDate);
  const viewWeekEnd = endOfDay(
    (() => {
      const d = new Date(weekStartDate);
      d.setDate(d.getDate() + 6);
      return d;
    })(),
  );
  return { viewWeekStart, viewWeekEnd };
}
