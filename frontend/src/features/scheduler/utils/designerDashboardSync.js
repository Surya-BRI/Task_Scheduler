import {
  countDesignerWeekSlots,
  sumDesignerWeekWorkload,
} from "./scheduler-workload.util";

export const SCHEDULER_DASHBOARD_SYNC_KEY = "design_scheduler_snapshot_v1";
export const SCHEDULER_DASHBOARD_SYNC_EVENT = "design-scheduler:updated";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX_DAILY_HOURS = 12;
const NORMAL_DAILY_HOURS = 8;

const toTaskLabel = (task) => {
  if (task?.requestLabel) return task.requestLabel;
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

const normalizeLeaveSession = (session) =>
  String(session ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const getHalfDayLeaveSession = (task, regularHours) => {
  if (task?.requestType !== "LEAVE") return null;
  if (regularHours >= NORMAL_DAILY_HOURS) return null;
  const session = normalizeLeaveSession(task.leaveSession);
  if (session === "first half" || session === "first session" || session === "first" || session === "am" || session === "morning") return "first";
  if (session === "second half" || session === "second session" || session === "second" || session === "pm" || session === "afternoon") return "second";
  return null;
};

const getRegularVisualOrder = (entry) => {
  const session = getHalfDayLeaveSession(entry.task, entry.regularHours);
  if (session === "first") return 0;
  if (session === "second") return 2;
  return 1;
};

const pushTimelineBlock = (rawTasks, task, startHr, endHr, { isOvertime = false, idSuffix = null } = {}) => {
  if (!(endHr > startHr)) return;
  const isSystemBlock = Boolean(task.isSystemBlock);
  // Leave/reg keep their own chrome even if packed past the 8h line.
  const useSystemChrome = isSystemBlock && (task.requestType === "LEAVE" || task.requestType === "REGULARIZATION");
  rawTasks.push({
    id: idSuffix ? `${task.id}${idSuffix}` : isOvertime ? `${task.id}-ot` : task.id,
    parentId: task.parentId ?? task.id,
    designType: task.designType ?? null,
    label: isOvertime && !useSystemChrome ? `${toTaskLabel(task)} (OT)` : toTaskLabel(task),
    estimatedHours: endHr - startHr,
    colorClass: isOvertime && !useSystemChrome
      ? (task.overtimeColorClass ?? "bg-red-100 border border-red-300 text-red-800")
      : task.colorClass,
    startHr,
    endHr,
    isOvertime: isOvertime && !useSystemChrome,
    isSystemBlock,
    requestType: task.requestType,
    requestLabel: task.requestLabel ?? null,
  });
};

const buildDaySlot = (taskIds, tasksMap) => {
  let regularCursor = 0;
  const rawTasks = [];
  const overflowTasks = [];
  const rawTaskIds = [];
  const rawRecordIds = [];
  const entries = [];

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

    entries.push({ task, regularHours, overtimeHours, order: entries.length });
  }

  const regularEntries = entries
    .filter((entry) => entry.regularHours > 0)
    .sort((a, b) => getRegularVisualOrder(a) - getRegularVisualOrder(b) || a.order - b.order);

  // Pack leave + work sequentially. An HOD-overloaded day (>8h regular) keeps rendering
  // past hour 8 up to the 12h ceiling instead of silently hiding the extra tasks. Any
  // portion past the 8h line is HOD-forced overtime, so it renders in the red OT style
  // even though no OvertimeRequest exists for it.
  for (const entry of regularEntries) {
    if (entry.task.requestType === "REGULARIZATION") continue;
    const { task, regularHours } = entry;
    const session = getHalfDayLeaveSession(task, regularHours);
    const startHr = session === "first"
      ? 0
      : session === "second"
        ? Math.max(NORMAL_DAILY_HOURS / 2, regularCursor)
        : regularCursor;
    if (startHr >= MAX_DAILY_HOURS) continue;
    const endHr = Math.min(startHr + regularHours, MAX_DAILY_HOURS);
    regularCursor = Math.max(regularCursor, endHr);
    pushTimelineBlock(rawTasks, task, startHr, Math.min(endHr, NORMAL_DAILY_HOURS));
    if (endHr > NORMAL_DAILY_HOURS) {
      pushTimelineBlock(rawTasks, task, Math.max(startHr, NORMAL_DAILY_HOURS), endHr, {
        isOvertime: true,
        idSuffix: "-overload",
      });
    }
  }

  // Fit regularization into remaining normal hours; overflow goes to a second row.
  let overflowCursor = 0;
  for (const entry of regularEntries) {
    if (entry.task.requestType !== "REGULARIZATION") continue;
    const { task, regularHours } = entry;
    const remaining = NORMAL_DAILY_HOURS - regularCursor;
    if (regularHours <= remaining) {
      const startHr = regularCursor;
      const endHr = startHr + regularHours;
      regularCursor = endHr;
      pushTimelineBlock(rawTasks, task, startHr, endHr);
      continue;
    }

    const startHr = overflowCursor;
    const endHr = Math.min(startHr + regularHours, NORMAL_DAILY_HOURS);
    overflowCursor = endHr;
    if (endHr > startHr) {
      overflowTasks.push({
        id: `${task.id}-overflow`,
        parentId: task.parentId ?? task.id,
        designType: task.designType ?? null,
        label: toTaskLabel(task),
        estimatedHours: endHr - startHr,
        colorClass: task.colorClass,
        startHr,
        endHr,
        isOvertime: false,
        isSystemBlock: true,
        requestType: task.requestType,
        requestLabel: task.requestLabel ?? null,
        isOverflow: true,
      });
    }
  }

  // Approved OT starts after the normal band — or after the regular blocks when the day
  // is overloaded past 8h — never overlapping them.
  let overtimeCursor = Math.max(NORMAL_DAILY_HOURS, regularCursor);
  let hasOvertime = false;
  for (const entry of entries) {
    if (!(entry.overtimeHours > 0)) continue;
    hasOvertime = true;
    const startHr = overtimeCursor;
    const endHr = Math.min(overtimeCursor + entry.overtimeHours, MAX_DAILY_HOURS);
    overtimeCursor = endHr;
    pushTimelineBlock(rawTasks, entry.task, startHr, endHr, { isOvertime: true });
  }

  const assignedStartHr = 0;
  const assignedEndHr = Math.min(
    Math.max(regularCursor, hasOvertime ? overtimeCursor : 0),
    MAX_DAILY_HOURS,
  );

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
    overflowTasks,
    rawTaskIds,
    rawRecordIds,
  };
};

export const buildDesignerSnapshot = (tasksMap, designerScheduleByDayIndex = {}) => {
  /** @type {Record<string, ReturnType<typeof buildDaySlot>>} */
  const schedule = {};
  const dayTaskRecordIds = {};
  const assignedRecordIds = [];
  const seenAssignedRecordIds = new Set();
  let lastWorkDayIndex = null;
  let lastWorkDayHours = 0;

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
    if (dayIndex <= 4) {
      const visibleDayHours =
        daySlot.tasks.reduce((total, task) => total + task.estimatedHours, 0) +
        (daySlot.overflowTasks ?? []).reduce((total, task) => total + task.estimatedHours, 0);
      if (visibleDayHours > 0) {
        lastWorkDayIndex = dayIndex;
        lastWorkDayHours = visibleDayHours;
      }
    }
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
      tasks: countDesignerWeekSlots(designerScheduleByDayIndex),
      hours: sumDesignerWeekWorkload(tasksMap, designerScheduleByDayIndex),
      // Last weekday (0=Mon..4=Fri) with scheduled work this week, and that day's hours.
      lastWorkDayIndex,
      lastWorkDayHours,
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
