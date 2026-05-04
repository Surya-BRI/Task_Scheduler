export const SCHEDULER_DASHBOARD_SYNC_KEY = "design_scheduler_snapshot_v1";
export const SCHEDULER_DASHBOARD_SYNC_EVENT = "design-scheduler:updated";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_DAILY_HOURS = 12;

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

const buildDaySlot = (taskIds, tasksMap) => {
  let cursor = 0;
  const rawTasks = [];

  for (const taskId of taskIds) {
    const task = tasksMap[taskId];
    if (!task) continue;
    const hours = toPositiveHours(task.estimatedHours);
    if (!hours) continue;

    const startHr = cursor;
    const endHr = cursor + hours;
    cursor = endHr;

    rawTasks.push({
      id: task.id,
      label: toTaskLabel(task),
      estimatedHours: hours,
      colorClass: task.colorClass,
      startHr,
      endHr,
    });
  }

  const assignedStartHr = 0;
  const assignedEndHr = Math.min(cursor, MAX_DAILY_HOURS);

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
  };
};

export const buildDesignerSnapshot = (tasksMap, designerScheduleByDayIndex = {}) => {
  const schedule = {};
  let totalHours = 0;
  let totalTasks = 0;

  DAY_NAMES.forEach((dayName, dayIndex) => {
    const dayKey = dayIndex.toString();
    const taskIds = designerScheduleByDayIndex[dayKey] || [];
    const daySlot = buildDaySlot(taskIds, tasksMap);
    schedule[dayName] = daySlot;
    totalTasks += daySlot.tasks.length;
    totalHours += daySlot.tasks.reduce((acc, task) => acc + task.estimatedHours, 0);
  });

  return {
    schedule,
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
