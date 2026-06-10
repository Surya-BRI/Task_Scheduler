/** All task statuses allowed by CK_Task_status (see prisma/sql/add-new-task-statuses.sql). */
export const ACTIVE_TASK_STATUSES = [
  'PENDING',
  'WIP',
  'REVISION',
  'DESIGN_NEW',
  'DESIGN_PLANNED',
  'IN_PROGRESS',
  'HOD_REVIEW',
  'SALES_REVIEW',
  'REWORK',
  'CLIENT_REJECTED',
] as const;

export const ON_HOLD_TASK_STATUSES = ['ON_HOLD'] as const;

export const COMPLETED_TASK_STATUSES = [
  'COMPLETED',
  'APPROVED',
  'DESIGN_COMPLETED',
  'REVIEW_COMPLETED',
] as const;

export const ALL_KNOWN_TASK_STATUSES = [
  ...ACTIVE_TASK_STATUSES,
  ...ON_HOLD_TASK_STATUSES,
  ...COMPLETED_TASK_STATUSES,
] as const;

export type TaskStatusBucket = 'active' | 'onHold' | 'completed';

const ACTIVE_SET = new Set<string>(ACTIVE_TASK_STATUSES);
const ON_HOLD_SET = new Set<string>(ON_HOLD_TASK_STATUSES);
const COMPLETED_SET = new Set<string>(COMPLETED_TASK_STATUSES);

export function normalizeTaskStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toUpperCase();
}

export function categorizeTaskStatus(status: string | null | undefined): TaskStatusBucket {
  const normalized = normalizeTaskStatus(status);
  if (COMPLETED_SET.has(normalized)) return 'completed';
  if (ON_HOLD_SET.has(normalized)) return 'onHold';
  if (ACTIVE_SET.has(normalized)) return 'active';
  // Unknown / future statuses count as active so analytics never drop tasks.
  return 'active';
}

export interface StatusBucketTotals {
  active: number;
  onHold: number;
  completed: number;
  unknown: number;
  total: number;
}

export function aggregateStatusCounts(
  counts: Record<string, number>,
): StatusBucketTotals {
  let active = 0;
  let onHold = 0;
  let completed = 0;
  let unknown = 0;

  for (const [status, count] of Object.entries(counts)) {
    const bucket = categorizeTaskStatus(status);
    if (bucket === 'active') {
      if (!ACTIVE_SET.has(normalizeTaskStatus(status)) && !ON_HOLD_SET.has(normalizeTaskStatus(status)) && !COMPLETED_SET.has(normalizeTaskStatus(status))) {
        unknown += count;
      }
      active += count;
    } else if (bucket === 'onHold') {
      onHold += count;
    } else {
      completed += count;
    }
  }

  return {
    active,
    onHold,
    completed,
    unknown,
    total: active + onHold + completed,
  };
}

export const COMPLETED_STATUS_FILTER = [...COMPLETED_TASK_STATUSES] as string[];
