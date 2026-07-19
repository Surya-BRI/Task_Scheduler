import { formatHoursAsHm, toPositiveHours } from "@/lib/format-duration";

export const WEEKDAY_INDICES = [0, 1, 2, 3, 4];

/**
 * Day-footer label that leads with the same total the week row uses
 * (regular + OT), then shows capacity / OT breakdown.
 * e.g. "8h/8h", "0h/8h" (fully free), or "9h 10m (8h/8h + 1h 10m OT)"
 */
export function formatDayWorkloadFooter(regularHours, overtimeHours, dailyCapacity = 8) {
  const regular = toPositiveHours(regularHours);
  const overtime = toPositiveHours(overtimeHours);
  const regularLabel = regular > 0 ? formatHoursAsHm(regular) : "0h";
  const capacityLabel = `${regularLabel}/${dailyCapacity}h`;
  if (!overtime) return capacityLabel;
  return `${formatHoursAsHm(regular + overtime)} (${capacityLabel} + ${formatHoursAsHm(overtime)} OT)`;
}

/**
 * Normal (non-OT) hours for one assignment row.
 * When scheduledHours is absent, subtract approved OT from assignedHours so OT is not double-counted
 * when a separate overtime slot also exists in the grid.
 */
export function resolveAssignmentScheduledHours(row = {}) {
  if (row.scheduledHours != null && row.scheduledHours !== "") {
    return toPositiveHours(row.scheduledHours);
  }
  const assignedHours = toPositiveHours(row.assignedHours);
  const approvedOvertimeHours = toPositiveHours(row.approvedOvertimeHours);
  return Math.max(assignedHours - approvedOvertimeHours, 0);
}

/** Regular hours for a grid slot (0 when the slot is the dedicated OT block). */
export function getWorkloadRegularHours(task) {
  if (!task || task.isOvertime) return 0;
  return toPositiveHours(task.scheduledHours ?? task.estimatedHours);
}

/** Overtime hours for a grid slot. */
export function getWorkloadOvertimeHours(task) {
  if (!task) return 0;
  if (task.isOvertime) {
    return toPositiveHours(task.approvedOvertimeHours ?? task.estimatedHours);
  }
  return toPositiveHours(task.approvedOvertimeHours);
}

export function sumSlotRegularHours(taskMap, taskIds = []) {
  return taskIds.reduce((acc, taskId) => acc + getWorkloadRegularHours(taskMap[taskId]), 0);
}

export function sumSlotTotalHours(taskMap, taskIds = []) {
  return taskIds.reduce((acc, taskId) => {
    const task = taskMap[taskId];
    return acc + getWorkloadRegularHours(task) + getWorkloadOvertimeHours(task);
  }, 0);
}

/** Week workload for one designer — raw assignment sum (matches HOD planning row total). */
export function sumDesignerWeekWorkload(taskMap, scheduleByDayIndex = {}, weekdayIndices = WEEKDAY_INDICES) {
  return weekdayIndices.reduce((acc, dayIdx) => {
    const taskIds = scheduleByDayIndex[dayIdx.toString()] || [];
    return acc + sumSlotTotalHours(taskMap, taskIds);
  }, 0);
}

/** Assignment slots scheduled this week (each grid cell entry, including OT / leave / reg blocks). */
export function countDesignerWeekSlots(scheduleByDayIndex = {}, weekdayIndices = WEEKDAY_INDICES) {
  return weekdayIndices.reduce((acc, dayIdx) => {
    return acc + (scheduleByDayIndex[dayIdx.toString()] || []).length;
  }, 0);
}
