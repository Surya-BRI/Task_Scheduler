import { toPositiveHours } from '@/lib/format-duration';

export type SchedulerSlice = {
  id: string;
  dayIndex: number;
  estimatedHours: number;
  isLoggedRemainder?: boolean;
};

/** All grid slices for one designer + canonical task, earliest day first. */
export function collectDesignerTaskSlices(
  schedules: Record<string, Record<string, string[]>>,
  tasks: Record<string, { id?: string; parentId?: string; estimatedHours?: number; isLoggedRemainder?: boolean; isOvertime?: boolean } | undefined>,
  designerId: string,
  canonicalTaskId: string,
): SchedulerSlice[] {
  const slices: SchedulerSlice[] = [];
  const dayMap = schedules[designerId] || {};
  for (const [dayStr, taskIds] of Object.entries(dayMap)) {
    const dayIndex = Number(dayStr);
    if (!Number.isFinite(dayIndex)) continue;
    for (const id of taskIds || []) {
      const task = tasks[id];
      if (!task || task.isOvertime) continue;
      const taskCanonical = task.parentId && task.parentId !== task.id ? task.parentId : task.id;
      if (taskCanonical !== canonicalTaskId) continue;
      slices.push({
        id,
        dayIndex,
        estimatedHours: toPositiveHours(task.estimatedHours),
        isLoggedRemainder: Boolean(task.isLoggedRemainder),
      });
    }
  }
  return slices.sort((a, b) => a.dayIndex - b.dayIndex || a.id.localeCompare(b.id));
}

/** Whole seconds from decimal hours (assignment/DTO precision). */
export function hoursToSeconds(hours: number): number {
  const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  return Math.max(0, Math.round(h * 3600));
}

/**
 * Decimal hours for scheduler assignment rows (2 dp, DTO @Min(0.01)).
 * Zero stays zero; any positive seconds become at least 0.01h so a logged card can persist.
 */
export function secondsToAssignmentHours(seconds: number): number {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  if (s <= 0) return 0;
  return Math.max(0.01, Math.round((s / 3600) * 100) / 100);
}

/**
 * Allocate total logged seconds across slices in day order (Mon before Tue).
 * Locked "· logged" slices are credited first; remaining time fills active slices FIFO.
 */
export function allocateLoggedSecondsFifo(
  slices: SchedulerSlice[],
  totalLoggedSeconds: number,
): Map<string, number> {
  const map = new Map<string, number>();
  let pool = Math.max(0, Math.floor(totalLoggedSeconds));

  for (const slice of slices) {
    const capacity = hoursToSeconds(slice.estimatedHours);
    if (slice.isLoggedRemainder) {
      map.set(slice.id, capacity);
      pool = Math.max(0, pool - capacity);
      continue;
    }
    const alloc = Math.min(pool, capacity);
    map.set(slice.id, alloc);
    pool = Math.max(0, pool - alloc);
  }
  return map;
}

/**
 * Allocate total logged hours across slices in day order (Mon before Tue).
 * Locked "· logged" slices are credited first; remaining time fills active slices FIFO.
 */
export function allocateLoggedHoursFifo(
  slices: SchedulerSlice[],
  totalLoggedHours: number,
): Map<string, number> {
  const secondsMap = allocateLoggedSecondsFifo(slices, hoursToSeconds(totalLoggedHours));
  const map = new Map<string, number>();
  for (const [id, seconds] of secondsMap) {
    // Preserve exact 2dp hour amounts used by older call sites / tests (no 0.01 floor here).
    map.set(id, Math.round((seconds / 3600) * 100) / 100);
  }
  return map;
}

/** Non-locked slices still on this designer's grid for the task (excluding the card being dragged). */
export function countOtherActiveSlices(slices: SchedulerSlice[], excludeId: string): number {
  return slices.filter((s) => s.id !== excludeId && !s.isLoggedRemainder).length;
}
