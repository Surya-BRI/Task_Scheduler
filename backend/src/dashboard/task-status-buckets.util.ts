export const ACTIVE_TASK_STATUSES = [
  'DESIGN_NEW',
  'DESIGN_PLANNED',
  'IN_PROGRESS',
  'REWORK',
] as const;

/** Submitted / waiting on HOD or Sales — not client-final. */
export const IN_REVIEW_TASK_STATUSES = [
  'DESIGN_COMPLETED',
  'HOD_REVIEW',
  'SALES_REVIEW',
] as const;

export const ON_HOLD_TASK_STATUSES = ['ON_HOLD'] as const;

/** Client-final closed revisions (accepted or rejected). */
export const CLOSED_TASK_STATUSES = [
  'CLIENT_ACCEPTED',
  'CLIENT_REJECTED',
] as const;

/** @deprecated Prefer CLOSED_TASK_STATUSES */
export const COMPLETED_TASK_STATUSES = CLOSED_TASK_STATUSES;

export const ALL_KNOWN_TASK_STATUSES = [
  ...ACTIVE_TASK_STATUSES,
  ...IN_REVIEW_TASK_STATUSES,
  ...ON_HOLD_TASK_STATUSES,
  ...CLOSED_TASK_STATUSES,
] as const;

export type TaskStatusBucket = 'active' | 'inReview' | 'onHold' | 'closed';

const ACTIVE_SET = new Set<string>(ACTIVE_TASK_STATUSES);
const IN_REVIEW_SET = new Set<string>(IN_REVIEW_TASK_STATUSES);
const ON_HOLD_SET = new Set<string>(ON_HOLD_TASK_STATUSES);
const CLOSED_SET = new Set<string>(CLOSED_TASK_STATUSES);

export function normalizeTaskStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toUpperCase();
}

export function categorizeTaskStatus(status: string | null | undefined): TaskStatusBucket {
  const normalized = normalizeTaskStatus(status);
  if (CLOSED_SET.has(normalized)) return 'closed';
  if (ON_HOLD_SET.has(normalized)) return 'onHold';
  if (IN_REVIEW_SET.has(normalized)) return 'inReview';
  if (ACTIVE_SET.has(normalized)) return 'active';
  // Unknown / future statuses count as active so analytics never drop tasks.
  return 'active';
}

export interface StatusBucketTotals {
  active: number;
  inReview: number;
  onHold: number;
  closed: number;
  /** @deprecated Alias of closed — kept for older callers */
  completed: number;
  unknown: number;
  total: number;
}

export function aggregateStatusCounts(
  counts: Record<string, number>,
): StatusBucketTotals {
  let active = 0;
  let inReview = 0;
  let onHold = 0;
  let closed = 0;
  let unknown = 0;

  for (const [status, count] of Object.entries(counts)) {
    const normalized = normalizeTaskStatus(status);
    const known =
      ACTIVE_SET.has(normalized) ||
      IN_REVIEW_SET.has(normalized) ||
      ON_HOLD_SET.has(normalized) ||
      CLOSED_SET.has(normalized);

    if (!known) unknown += count;

    const bucket = categorizeTaskStatus(status);
    if (bucket === 'active') active += count;
    else if (bucket === 'inReview') inReview += count;
    else if (bucket === 'onHold') onHold += count;
    else closed += count;
  }

  return {
    active,
    inReview,
    onHold,
    closed,
    completed: closed,
    unknown,
    total: active + inReview + onHold + closed,
  };
}

export const COMPLETED_STATUS_FILTER = [...CLOSED_TASK_STATUSES] as string[];
export const CLOSED_STATUS_FILTER = COMPLETED_STATUS_FILTER;
