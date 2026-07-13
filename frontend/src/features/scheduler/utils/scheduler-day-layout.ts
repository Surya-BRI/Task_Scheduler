import { toPositiveHours } from '@/lib/format-duration';

const DAILY_CAPACITY = 8;

export type SchedulerDayTask = {
  id?: string;
  isOvertime?: boolean;
  isSystemBlock?: boolean;
  isPinned?: boolean;
  requestType?: string | null;
  leaveHours?: number | string | null;
  scheduledHours?: number | string | null;
  estimatedHours?: number | string | null;
  assignedHours?: number | string | null;
  leaveSession?: string | null;
};

export const isRequestSystemBlock = (task?: SchedulerDayTask | null) =>
  Boolean(task?.isSystemBlock || task?.requestType === 'LEAVE' || task?.requestType === 'REGULARIZATION');

/** Leave/regularization blocks must never be moved by the auto-optimizer. */
export const shouldSkipOptimizerTask = (task?: SchedulerDayTask | null) =>
  Boolean(task?.isOvertime || task?.isPinned || isRequestSystemBlock(task));

const normalizeLeaveSession = (session?: string | null) =>
  String(session ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const getHalfDayLeaveVisualOrder = (task?: SchedulerDayTask | null) => {
  if (task?.requestType !== 'LEAVE') return 1;
  if (toPositiveHours(task.leaveHours ?? task.scheduledHours ?? task.estimatedHours) >= DAILY_CAPACITY) {
    return 0;
  }
  const session = normalizeLeaveSession(task.leaveSession);
  if (session === 'first half' || session === 'first session' || session === 'first' || session === 'am' || session === 'morning') {
    return 0;
  }
  if (session === 'second half' || session === 'second session' || session === 'second' || session === 'pm' || session === 'afternoon') {
    return 2;
  }
  return 1;
};

export const sortRegularTaskIdsForVisualSession = (
  taskIds: string[],
  taskMap: Record<string, SchedulerDayTask | undefined>,
) =>
  taskIds
    .map((taskId, order) => ({ taskId, order }))
    .sort(
      (a, b) =>
        getHalfDayLeaveVisualOrder(taskMap[a.taskId]) - getHalfDayLeaveVisualOrder(taskMap[b.taskId]) ||
        a.order - b.order,
    )
    .map((entry) => entry.taskId);

const getRegularTaskHours = (task?: SchedulerDayTask | null) =>
  task?.isOvertime ? 0 : toPositiveHours(task?.scheduledHours ?? task?.estimatedHours);

export type DayTaskLayout = {
  visualRegularTaskIds: string[];
  overtimeTaskIds: string[];
};

/**
 * Splits a day's task ids for grid rendering.
 * Approved leave/regularization blocks always stay in the regular row and are
 * never pushed into the overtime strip when other tasks are added/removed.
 */
export const partitionDayTaskIds = (
  rawTaskIds: string[],
  taskMap: Record<string, SchedulerDayTask | undefined>,
  dailyCapacity = DAILY_CAPACITY,
): DayTaskLayout => {
  const systemBlockIds: string[] = [];
  const overtimeIds: string[] = [];
  const schedulableRegularIds: string[] = [];

  for (const taskId of rawTaskIds) {
    const task = taskMap[taskId];
    if (!task) continue;
    if (task.isOvertime) {
      overtimeIds.push(taskId);
      continue;
    }
    if (isRequestSystemBlock(task)) {
      systemBlockIds.push(taskId);
      continue;
    }
    schedulableRegularIds.push(taskId);
  }

  let cumulativeHours = systemBlockIds.reduce((acc, taskId) => acc + getRegularTaskHours(taskMap[taskId]), 0);

  const withinCapacityIds: string[] = [];
  const overflowIds: string[] = [];
  for (const taskId of schedulableRegularIds) {
    const hours = getRegularTaskHours(taskMap[taskId]);
    if (cumulativeHours >= dailyCapacity) {
      overflowIds.push(taskId);
    } else {
      withinCapacityIds.push(taskId);
      cumulativeHours += hours;
    }
  }

  // Interleave leave with tasks by session (first-half leave left, tasks middle, second-half leave right).
  const visualRegularTaskIds = sortRegularTaskIdsForVisualSession(
    [...systemBlockIds, ...withinCapacityIds],
    taskMap,
  );

  return {
    visualRegularTaskIds,
    overtimeTaskIds: [...overtimeIds, ...overflowIds],
  };
};
