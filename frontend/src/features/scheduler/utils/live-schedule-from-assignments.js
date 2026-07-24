import { resolveAssignmentScheduledHours } from "./scheduler-workload.util";
import { buildDesignerSnapshot } from "./designerDashboardSync";
import { getSystemBlockColorClass } from "./scheduler-system-block.ui";

const DASH_COLORS = [
  "bg-blue-100 border border-blue-300 text-blue-800",
  "bg-emerald-100 border border-emerald-300 text-emerald-800",
  "bg-violet-100 border border-violet-300 text-violet-800",
  "bg-amber-100 border border-amber-300 text-amber-800",
  "bg-rose-100 border border-rose-300 text-rose-800",
  "bg-teal-100 border border-teal-300 text-teal-800",
  "bg-orange-100 border border-orange-300 text-orange-800",
];

const toPositiveHours = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

function isRequestRow(row) {
  return row?.requestType === "LEAVE" || row?.requestType === "REGULARIZATION";
}

function getRequestRowHours(row) {
  if (row?.requestType === "LEAVE") return toPositiveHours(row.leaveHours ?? row.scheduledHours ?? row.assignedHours);
  if (row?.requestType === "REGULARIZATION") {
    return toPositiveHours(row.regularizationHours ?? row.scheduledHours ?? row.assignedHours);
  }
  return 0;
}

function getRequestRowLabel(row) {
  if (row?.requestLabel) return row.requestLabel;
  if (row?.requestType === "LEAVE") {
    const parts = ["Approved leave"];
    if (row.leaveSession) parts.push(row.leaveSession);
    return parts.join(" - ");
  }
  if (row?.requestType === "REGULARIZATION") return "Approved regularization";
  return "Request";
}

function formatScheduleTaskLabel(apiTask, taskId) {
  if (apiTask?.revisionCode) {
    return `${apiTask?.opNo ? apiTask.opNo + "-" : ""}${apiTask.revisionCode}`;
  }
  return apiTask?.opNo || `Task #${String(taskId ?? "").slice(0, 6)}`;
}

function resolveScheduleApiTask(assignment, taskById) {
  return assignment?.task ?? taskById?.[assignment?.taskId] ?? null;
}

/**
 * Build designer-dashboard schedule snapshot from week assignment rows.
 * Uses embedded row.task summaries when present (same path as designer / HOD).
 */
export function buildLiveScheduleFromAssignments(assignments, tasksArr) {
  const taskById = Object.fromEntries((tasksArr || []).map((t) => [t.id, t]));
  const tasksMap = {};
  const scheduleByDayIndex = {};
  let colorIdx = 0;
  const colorMap = {};

  (assignments || []).forEach((a) => {
    if (isRequestRow(a)) {
      const hours = getRequestRowHours(a);
      if (!hours) return;
      const requestId = a.requestType === "LEAVE"
        ? a.leaveRequestIds?.[0] ?? a.id
        : a.regularizationRequestIds?.[0] ?? a.id;
      const key = `${String(a.requestType).toLowerCase()}-${requestId}-${a.dayIndex}`;
      tasksMap[key] = {
        id: key,
        name: getRequestRowLabel(a),
        baseName: getRequestRowLabel(a),
        estimatedHours: hours,
        scheduledHours: hours,
        approvedOvertimeHours: 0,
        colorClass: getSystemBlockColorClass(a.requestType)
          ?? "bg-slate-100 border border-slate-300 text-slate-800",
        isLocked: true,
        isSystemBlock: true,
        requestType: a.requestType,
        leaveSession: a.leaveSession ?? null,
        requestLabel: a.requestLabel ?? getRequestRowLabel(a),
      };
      const dayStr = String(a.dayIndex);
      if (!scheduleByDayIndex[dayStr]) scheduleByDayIndex[dayStr] = [];
      scheduleByDayIndex[dayStr].push(key);
      return;
    }

    const key = a.splitIndex != null ? `${a.taskId}_s${a.splitIndex}` : a.taskId;
    const apiTask = resolveScheduleApiTask(a, taskById);
    const approvedOvertimeHours = Number(a.approvedOvertimeHours) || 0;
    const scheduledHours = resolveAssignmentScheduledHours(a);
    if (!colorMap[a.taskId]) {
      colorMap[a.taskId] = DASH_COLORS[colorIdx % DASH_COLORS.length];
      colorIdx++;
    }
    const label = formatScheduleTaskLabel(apiTask, a.taskId);
    tasksMap[key] = {
      id: key,
      parentId: a.parentId ?? (a.splitIndex != null ? a.taskId : null),
      designType: apiTask?.designType ?? apiTask?.project?.category ?? null,
      name: label,
      baseName: label,
      estimatedHours: scheduledHours,
      scheduledHours,
      approvedOvertimeHours,
      colorClass: colorMap[a.taskId],
      overtimeColorClass: "bg-red-100 border border-red-300 text-red-800",
      splitIndex: a.splitIndex,
      totalParts: a.totalParts,
    };
    const dayStr = String(a.dayIndex);
    if (!scheduleByDayIndex[dayStr]) scheduleByDayIndex[dayStr] = [];
    scheduleByDayIndex[dayStr].push(key);
  });

  return buildDesignerSnapshot(tasksMap, scheduleByDayIndex);
}

export function formatWorkTillLabel(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const n = d.getDate();
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  const ordinal = n + (s[(v - 20) % 10] || s[v] || s[0]);
  return `${d.toLocaleDateString("en-US", { weekday: "long" })} ${ordinal}`;
}
