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

/**
 * Allocate total logged hours across slices in day order (Mon before Tue).
 * Locked "· logged" slices are credited first; remaining time fills active slices FIFO.
 */
export function allocateLoggedHoursFifo(
  slices: SchedulerSlice[],
  totalLoggedHours: number,
): Map<string, number> {
  const map = new Map<string, number>();
  let pool = Math.max(0, totalLoggedHours);

  for (const slice of slices) {
    if (slice.isLoggedRemainder) {
      map.set(slice.id, slice.estimatedHours);
      pool = Math.round(Math.max(0, pool - slice.estimatedHours) * 100) / 100;
      continue;
    }
    const alloc = Math.round(Math.min(pool, slice.estimatedHours) * 100) / 100;
    map.set(slice.id, alloc);
    pool = Math.round(Math.max(0, pool - alloc) * 100) / 100;
  }
  return map;
}

/** Non-locked slices still on this designer's grid for the task (excluding the card being dragged). */
export function countOtherActiveSlices(slices: SchedulerSlice[], excludeId: string): number {
  return slices.filter((s) => s.id !== excludeId && !s.isLoggedRemainder).length;
}
