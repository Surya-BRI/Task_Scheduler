export const SCHEDULER_DASHBOARD_SYNC_KEY = "design_scheduler_snapshot_v1";
export const SCHEDULER_DASHBOARD_SYNC_EVENT = "design-scheduler:updated";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_DAILY_HOURS = 12;
const NORMAL_DAILY_HOURS = 8;

const toTaskLabel = (task) => {
  if (task.splitIndex && task.totalParts && task.totalParts > 1) {
    return `${task.baseName ?? task.name} ${task.splitIndex}/${task.totalParts}`;
  }
  return task.name;
};

const toPositiveHours = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
};

const getRegularHours = (task) => {
  if (task?.isOvertime) return 0;
  return toPositiveHours(task?.scheduledHours ?? task?.estimatedHours);
};

const getOvertimeHours = (task) => {
  if (task?.isOvertime) return toPositiveHours(task?.approvedOvertimeHours ?? task?.estimatedHours);
  return toPositiveHours(task?.approvedOvertimeHours);
};

const buildDaySlot = (taskIds, tasksMap) => {
  let regularCursor = 0;
  let overtimeCursor = NORMAL_DAILY_HOURS;
  let hasOvertime = false;
  const rawTasks = [];
  const rawTaskIds = [];
  const rawRecordIds = [];

  for (const taskId of taskIds) {
    const task = tasksMap[taskId];
    if (!task) continue;
    const regularHours = getRegularHours(task);
    const overtimeHours = getOvertimeHours(task);
    if (!regularHours && !overtimeHours) continue;
    rawTaskIds.push(task.id);
    if (!task.isSystemBlock) {
      rawRecordIds.push(task.parentId ?? task.id);
    }

    if (regularHours > 0) {
      const startHr = regularCursor;
      const endHr = regularCursor + regularHours;
      regularCursor = endHr;

      rawTasks.push({
        id: task.id,
        label: toTaskLabel(task),
        estimatedHours: regularHours,
        colorClass: task.colorClass,
        startHr,
        endHr,
        isOvertime: false,
        isSystemBlock: Boolean(task.isSystemBlock),
        requestType: task.requestType,
      });
    }

    if (overtimeHours > 0) {
      hasOvertime = true;
      const startHr = overtimeCursor;
      const endHr = overtimeCursor + overtimeHours;
      overtimeCursor = endHr;

      rawTasks.push({
        id: `${task.id}-ot`,
        parentId: task.parentId ?? task.id,
        label: `${toTaskLabel(task)} (OT)`,
        estimatedHours: overtimeHours,
        colorClass: task.overtimeColorClass ?? "bg-red-100 border border-red-300 text-red-800",
        startHr,
        endHr,
        isOvertime: true,
      });
    }
  }

  const assignedStartHr = 0;
  const assignedEndHr = Math.min(Math.max(regularCursor, hasOvertime ? overtimeCursor : 0), MAX_DAILY_HOURS);

  const boundedTasks = [];
  for (const task of rawTasks) {
    if (task.startHr >= assignedEndHr) continue;
    const boundedEnd = Math.min(task.endHr, assignedEndHr);
    if (boundedEnd <= task.startHr) continue;
    boundedTasks.push({
      ...task,
      endHr: boundedEnd,
      estimatedHours: boundedEnd - task.startHr,
    });
  }

  return {
    assignedStartHr,
    assignedEndHr,
    tasks: boundedTasks,
    rawTaskIds,
    rawRecordIds,
  };
};

export const buildDesignerSnapshot = (tasksMap, designerScheduleByDayIndex = {}) => {
  const schedule = {};
  const dayTaskRecordIds = {};
  let totalHours = 0;
  let totalTasks = 0;
  const assignedRecordIds = [];
  const seenAssignedRecordIds = new Set();

  DAY_NAMES.forEach((dayName, dayIndex) => {
    const dayKey = dayIndex.toString();
    const taskIds = designerScheduleByDayIndex[dayKey] || [];
    const recordIdsForDay = [];
    const seenRecordIdsForDay = new Set();
    for (const taskId of taskIds) {
      const task = tasksMap[taskId];
      if (!task) continue;
      if (task.isSystemBlock) continue;
      const recordId = task.parentId ?? task.id;
      if (!recordId || seenRecordIdsForDay.has(recordId)) continue;
      seenRecordIdsForDay.add(recordId);
      recordIdsForDay.push(recordId);
    }
    dayTaskRecordIds[dayName] = recordIdsForDay;
    const daySlot = buildDaySlot(taskIds, tasksMap);
    schedule[dayName] = daySlot;
    totalTasks += daySlot.tasks.length;
    totalHours += daySlot.tasks.reduce((acc, task) => acc + task.estimatedHours, 0);
    for (const recordId of daySlot.rawRecordIds || []) {
      if (!recordId || seenAssignedRecordIds.has(recordId)) continue;
      seenAssignedRecordIds.add(recordId);
      assignedRecordIds.push(recordId);
    }
  });

  return {
    schedule,
    dayTaskRecordIds,
    assignedRecordIds,
    stats: {
      tasks: totalTasks,
      hours: totalHours,
    },
  };
};

export const buildSchedulerSnapshot = (tasksMap, schedulesMap) => {
  const designers = {};
  for (const [designerId, scheduleByDayIndex] of Object.entries(schedulesMap || {})) {
    designers[designerId] = buildDesignerSnapshot(tasksMap, scheduleByDayIndex);
  }
  return {
    updatedAt: Date.now(),
    designers,
  };
};
