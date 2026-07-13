/** Unified design-task lifecycle statuses (must match backend task-status.util.ts). */
export const TASK_STATUSES = [
  'DESIGN_NEW',
  'DESIGN_PLANNED',
  'IN_PROGRESS',
  'DESIGN_COMPLETED',
  'HOD_REVIEW',
  'SALES_REVIEW',
  'REWORK',
  'CLIENT_ACCEPTED',
  'CLIENT_REJECTED',
  'ON_HOLD',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

const TASK_STATUS_SET = new Set<string>(TASK_STATUSES);

export function normalizeTaskStatus(raw?: string | null): TaskStatus | string {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!value) return 'DESIGN_NEW';
  if (value === 'ON-HOLD') return 'ON_HOLD';
  if (TASK_STATUS_SET.has(value)) return value as TaskStatus;
  return 'DESIGN_NEW';
}
