/** Unified design-task lifecycle statuses (DB + API + UI). */
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

export function normalizeTaskStatus(raw?: string | null): string {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!value) return 'DESIGN_NEW';
  if (value === 'ON-HOLD') return 'ON_HOLD';
  if (TASK_STATUS_SET.has(value)) return value;
  return 'DESIGN_NEW';
}

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUS_SET.has(String(value ?? '').trim().toUpperCase());
}

export function toDbTaskStatus(status?: string | null): string {
  return normalizeTaskStatus(status);
}

export function toApiTaskStatus(status?: string | null): string {
  return normalizeTaskStatus(status);
}
