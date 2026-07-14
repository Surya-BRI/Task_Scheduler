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

const pushTimelineBlock = (rawTasks, task, startHr, endHr, { isOvertime = false } = {}) => {
  if (!(endHr > startHr)) return;
  rawTasks.push({
    id: isOvertime ? `${task.id}-ot` : task.id,
    parentId: task.parentId ?? task.id,
    designType: task.designType ?? null,
    label: isOvertime ? `${toTaskLabel(task)} (OT)` : toTaskLabel(task),
    estimatedHours: endHr - startHr,
    colorClass: isOvertime
      ? (task.overtimeColorClass ?? "bg-red-100 border border-red-300 text-red-800")
      : task.colorClass,
    startHr,
    endHr,
    isOvertime,
    isSystemBlock: Boolean(task.isSystemBlock),
    requestType: task.requestType,
  });
};

const buildDaySlot = (taskIds, tasksMap) => {
  let regularCursor = 0;
  let overtimeCursor = NORMAL_DAILY_HOURS;
  let hasOvertime = false;
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

    if (overtimeHours > 0) {
      hasOvertime = true;
      const startHr = overtimeCursor;
      const endHr = Math.min(overtimeCursor + overtimeHours, MAX_DAILY_HOURS);
      overtimeCursor = endHr;
      pushTimelineBlock(rawTasks, task, startHr, endHr, { isOvertime: true });
    }
  }

  const regularEntries = entries
    .filter((entry) => entry.regularHours > 0)
    .sort((a, b) => getRegularVisualOrder(a) - getRegularVisualOrder(b) || a.order - b.order);

  // Pack leave + work into the normal 0–8 band first (never spill into OT).
  for (const entry of regularEntries) {
    if (entry.task.requestType === "REGULARIZATION") continue;
    const { task, regularHours } = entry;
    const session = getHalfDayLeaveSession(task, regularHours);
    const startHr = session === "first"
      ? 0
      : session === "second"
        ? Math.max(NORMAL_DAILY_HOURS / 2, regularCursor)
        : regularCursor;
    if (startHr >= NORMAL_DAILY_HOURS) continue;
    const endHr = Math.min(startHr + regularHours, NORMAL_DAILY_HOURS);
    regularCursor = Math.max(regularCursor, endHr);
    pushTimelineBlock(rawTasks, task, startHr, endHr);
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
        isOverflow: true,
      });
    }
  }

  const assignedStartHr = 0;
  const assignedEndHr = Math.min(
    Math.max(Math.min(regularCursor, NORMAL_DAILY_HOURS), hasOvertime ? overtimeCursor : 0),
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
    totalTasks += daySlot.tasks.length + (daySlot.overflowTasks?.length ?? 0);
    totalHours += daySlot.tasks.reduce((acc, task) => acc + task.estimatedHours, 0);
    totalHours += (daySlot.overflowTasks ?? []).reduce((acc, task) => acc + task.estimatedHours, 0);
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
