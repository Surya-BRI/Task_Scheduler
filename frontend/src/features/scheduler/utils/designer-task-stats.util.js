import { getTaskRequiredHours } from "@/lib/task-hours";

/** Designer is drafting / assigned work (not waiting on review, not closed). */
export const ACTIVE_TASK_STATUSES = new Set([
  "DESIGN_NEW",
  "DESIGN_PLANNED",
  "IN_PROGRESS",
  "REWORK",
]);

/** Submitted or in HOD/Sales review — not client-final. */
export const IN_REVIEW_TASK_STATUSES = new Set([
  "DESIGN_COMPLETED",
  "HOD_REVIEW",
  "SALES_REVIEW",
]);

/**
 * Client-final closed revisions.
 * CLIENT_REJECTED closes that revision; a new DESIGN_NEW revision is created separately.
 */
export const CLOSED_TASK_STATUSES = new Set(["CLIENT_ACCEPTED", "CLIENT_REJECTED"]);

/** @deprecated Use CLOSED_TASK_STATUSES — kept for call sites that still say "completed". */
export const COMPLETED_TASK_STATUSES = CLOSED_TASK_STATUSES;

export function normalizeTaskStatus(status) {
  return String(status ?? "").trim().toUpperCase();
}

/**
 * Source of truth for when a task was closed (accepted or rejected).
 * Prefer completedAt; fall back to updatedAt only when status is already closed.
 */
export function getTaskCompletionDate(task) {
  if (task?.completedAt) {
    const completedAt = new Date(task.completedAt);
    if (!Number.isNaN(completedAt.getTime())) return completedAt;
  }
  if (!CLOSED_TASK_STATUSES.has(normalizeTaskStatus(task?.status))) return null;
  const fallback = new Date(task?.updatedAt ?? task?.createdAt ?? 0);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function getISOWeek(dateLike) {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7,
    )
  );
}

function startOfIsoWeek(dateLike) {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return d;
}

function formatWeekRangeLabel(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const opts = { month: "short", day: "numeric" };
  const startText = weekStart.toLocaleDateString("en-US", opts);
  const endText = weekEnd.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${startText} – ${endText}`;
}

function isSameCalendarMonth(date, month, year) {
  return date.getMonth() === month && date.getFullYear() === year;
}

function startOfDay(dateLike) {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateLike) {
  const d = dateLike instanceof Date ? new Date(dateLike) : new Date(dateLike);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Closed tasks (accepted + rejected) within an inclusive date range. */
export function countCompletedTasksInDateRange(tasks, rangeStart, rangeEnd) {
  if (!Array.isArray(tasks) || !rangeStart || !rangeEnd) return 0;
  const start = startOfDay(rangeStart);
  const end = endOfDay(rangeEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  let count = 0;
  for (const task of tasks) {
    if (!CLOSED_TASK_STATUSES.has(normalizeTaskStatus(task?.status))) continue;
    const completedAt = getTaskCompletionDate(task);
    if (!completedAt) continue;
    if (completedAt >= start && completedAt <= end) count += 1;
  }
  return count;
}

const EMPTY_DONUT_SLICE = { value: 0, pct: 0, color: "#94a3b8" };

/**
 * Task-list stats for the designer dashboard.
 *
 * Buckets:
 * - Active — drafting / planned / in progress / rework
 * - In Review — DESIGN_COMPLETED + HOD/Sales review
 * - On Hold — ON_HOLD
 * - Closed — CLIENT_ACCEPTED + CLIENT_REJECTED (client-final)
 *
 * Monthly / weekly closed counts use Closed only (via completedAt).
 */
export function computeDesignerTaskStats(tasks, { now = new Date(), viewWeekStart = null, viewWeekEnd = null } = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return {
      onHoldTasks: [],
      activeTasks: [],
      inReviewTasks: [],
      completedTasksByWeek: {},
      allCompletedCount: 0,
      monthlyCompletedCount: 0,
      monthlyHourCount: 0,
      weeklyCompletedCount: 0,
      monthlyCompletedRows: [],
      donut: {
        active: { ...EMPTY_DONUT_SLICE, color: "#4f8ef7" },
        inReview: { ...EMPTY_DONUT_SLICE, color: "#8b5cf6" },
        onHold: { ...EMPTY_DONUT_SLICE, color: "#f5a623" },
        closed: { ...EMPTY_DONUT_SLICE, color: "#7ed321" },
        // Back-compat alias used by older UI
        completed: { ...EMPTY_DONUT_SLICE, color: "#7ed321" },
        centerPct: 0,
        centerTotal: 0,
      },
      statsOverrides: {
        monthlyTaskCount: 0,
        weeklyCompletedCount: 0,
      },
    };
  }

  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 86400000);

  const fmtDdMmYyyy = (dateLike) => {
    if (!dateLike) return "-";
    const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-GB");
  };

  const toRow = (task) => ({
    id: task.id,
    taskNo: task.taskNo ?? "-",
    opNo: task.opNo ?? "-",
    projectDetails: task.project?.name ?? task.project?.projectNo ?? "-",
    designType: task.designType ?? task.project?.category ?? null,
    revisionCode: task.revisionCode ?? null,
    status: normalizeTaskStatus(task.status),
    deadline: fmtDdMmYyyy(task.dueDate),
    completedAt: getTaskCompletionDate(task)?.toISOString() ?? null,
  });

  const onHold = [];
  const closed = [];
  const inReview = [];
  const active = [];

  for (const task of tasks) {
    const status = normalizeTaskStatus(task.status);
    if (status === "ON_HOLD") onHold.push(task);
    else if (CLOSED_TASK_STATUSES.has(status)) closed.push(task);
    else if (IN_REVIEW_TASK_STATUSES.has(status)) inReview.push(task);
    else if (ACTIVE_TASK_STATUSES.has(status)) active.push(task);
  }

  const byUpdatedDesc = (a, b) => {
    const aTime = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const bTime = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return bTime - aTime;
  };
  onHold.sort(byUpdatedDesc);
  active.sort(byUpdatedDesc);
  inReview.sort(byUpdatedDesc);
  closed.sort((a, b) => {
    const aTime = getTaskCompletionDate(a)?.getTime() ?? 0;
    const bTime = getTaskCompletionDate(b)?.getTime() ?? 0;
    return bTime - aTime;
  });

  const toStatusRow = (task, idx) => ({
    id: task.id,
    no: idx + 1,
    details: task.title ?? task.opNo ?? "-",
    taskNo: task.taskNo ?? "-",
    opNo: task.opNo ?? "-",
    revisionCode: task.revisionCode ?? null,
    projectDetails: task.project?.name ?? task.project?.projectNo ?? "-",
    designType: task.designType ?? task.project?.category ?? null,
    status: normalizeTaskStatus(task.status),
    deadline: fmtDdMmYyyy(task.dueDate),
    urgent: task.dueDate ? new Date(task.dueDate) < threeDaysFromNow : false,
  });

  const onHoldTasks = onHold.map(toStatusRow);
  const activeTasks = active.map(toStatusRow);
  const inReviewTasks = inReview.map(toStatusRow);

  const monthlyClosed = closed.filter((task) => {
    const closedAt = getTaskCompletionDate(task);
    return closedAt ? isSameCalendarMonth(closedAt, currentMonth, currentYear) : false;
  });
  const monthlyHourCount = monthlyClosed.reduce((acc, task) => acc + getTaskRequiredHours(task), 0);
  const monthlyCompletedRows = monthlyClosed.map(toRow);

  const weekGroups = new Map();
  for (const task of closed) {
    const closedAt = getTaskCompletionDate(task);
    if (!closedAt) continue;
    const weekStart = startOfIsoWeek(closedAt);
    const weekKey = `${weekStart.getFullYear()}-W${String(getISOWeek(closedAt)).padStart(2, "0")}`;
    if (!weekGroups.has(weekKey)) {
      weekGroups.set(weekKey, {
        sortKey: weekStart.getTime(),
        label: formatWeekRangeLabel(weekStart),
        tasks: [],
      });
    }
    weekGroups.get(weekKey).tasks.push(toRow(task));
  }

  const completedTasksByWeek = {};
  [...weekGroups.values()]
    .sort((a, b) => b.sortKey - a.sortKey)
    .forEach((group) => {
      completedTasksByWeek[group.label] = group.tasks;
    });

  const total = active.length + inReview.length + onHold.length + closed.length || 1;
  const pct = (n) => Math.round((n / total) * 100);
  const closedSlice = {
    value: closed.length,
    pct: pct(closed.length),
    color: "#7ed321",
  };
  const donut = {
    active: { value: active.length, pct: pct(active.length), color: "#4f8ef7" },
    inReview: { value: inReview.length, pct: pct(inReview.length), color: "#8b5cf6" },
    onHold: { value: onHold.length, pct: pct(onHold.length), color: "#f5a623" },
    closed: closedSlice,
    completed: closedSlice,
    centerPct: pct(closed.length),
    centerTotal: total,
  };

  const weeklyCompletedCount =
    viewWeekStart && viewWeekEnd
      ? countCompletedTasksInDateRange(closed, viewWeekStart, viewWeekEnd)
      : 0;

  return {
    onHoldTasks,
    activeTasks,
    inReviewTasks,
    completedTasksByWeek,
    allCompletedCount: closed.length,
    monthlyCompletedCount: monthlyClosed.length,
    monthlyHourCount,
    weeklyCompletedCount,
    monthlyCompletedRows,
    donut,
    statsOverrides: {
      monthlyTaskCount: monthlyClosed.length,
      weeklyCompletedCount,
    },
  };
}
