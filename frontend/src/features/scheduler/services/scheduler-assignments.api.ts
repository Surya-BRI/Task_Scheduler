import { apiClient } from '@/lib/api-client';
import type { SchedulerTaskSummary } from './scheduler-queue.api';

export type SchedulerAssignmentRow = {
  id: string;
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: number;
  scheduledHours?: number;
  approvedOvertimeHours?: number;
  workedHours?: number;
  parentId: string | null;
  splitIndex: number | null;
  totalParts: number | null;
  weekStartDate: Date;
  weekEndDate: Date;
  notes: string | null;
  isLocked: boolean;
  isPinned: boolean;
  assignedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  overtimeRequestIds?: string[];
  requestType?: 'LEAVE' | 'REGULARIZATION' | 'OVERTIME' | null;
  isSystemBlock?: boolean;
  leaveRequestIds?: string[];
  leaveHours?: number;
  leaveSession?: string | null;
  regularizationRequestIds?: string[];
  regularizationHours?: number;
  requestStatus?: string | null;
  requestLabel?: string | null;
  isFragment?: boolean;
  fragmentId?: string | null;
  fragmentStatus?: 'UNASSIGNED' | 'ON_HOLD' | null;
  /** Other SchedulerAssignment rows for the same task (any week), excluding this row. */
  otherScheduledAssignmentCount?: number;
  task?: SchedulerTaskSummary | null;
};

export type SchedulerWeekMeta = {
  weekStart: string;
  version: number;
  isLocked: boolean;
  updatedAt: Date;
  updatedBy: string | null;
  /** Sorted `designerId|YYYY-MM-DD` keys for weekend day-locks (skipped days). */
  dayLockKeys?: string[];
  /** @deprecated Alias of dayLockKeys */
  dayUnlockKeys?: string[];
};

export type SaveSchedulerAssignmentInput = {
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: number;
  parentId?: string | null;
  splitIndex?: number | null;
  totalParts?: number | null;
  notes?: string | null;
  isPinned?: boolean;
  /** Logged-time remainder after partial handoff. */
  isLocked?: boolean;
};

/**
 * Hours that didn't fit anywhere in the week being saved. The server finds the next available
 * working day (skipping holidays/full-day leave/designer weekend day-locks; weekends otherwise open)
 * and creates the assignment row(s) itself, atomically with the rest of this save.
 */
export type SchedulerOverflowInput = {
  designerId: string;
  /** Canonical (parent) task id. */
  taskId: string;
  hours: number;
  isPinned?: boolean;
};

export type SchedulerOverflowPlacement = {
  weekStart: string;
  dayIndex: number;
  hours: number;
  taskId: string;
  designerId: string;
};

export type SchedulerUnplacedOverflow = {
  taskId: string;
  designerId: string;
  hours: number;
};

export type SchedulerDayLock = {
  id: string;
  designerId: string;
  date: string;
  lockedById?: string;
  unlockedById?: string;
  reason: string | null;
  createdAt: string;
};

/** @deprecated Use SchedulerDayLock */
export type SchedulerDayUnlock = SchedulerDayLock;

export type SchedulerWeekPayload = {
  assignments: SchedulerAssignmentRow[];
  dayLocks?: SchedulerDayLock[];
  dayUnlocks?: SchedulerDayUnlock[];
  /** Present on current API — week bootstrap no longer needs a parallel /meta GET. */
  weekStart?: string;
  version?: number;
  isLocked?: boolean;
  updatedAt?: Date | string;
  updatedBy?: string | null;
  dayLockKeys?: string[];
  dayUnlockKeys?: string[];
};

function normalizeWeekPayload(res: unknown): SchedulerWeekPayload {
  if (Array.isArray(res)) {
    return {
      assignments: res as SchedulerAssignmentRow[],
      dayLocks: [],
      dayUnlocks: [],
      version: 0,
      isLocked: false,
      dayLockKeys: [],
      dayUnlockKeys: [],
    };
  }
  const obj = (res ?? {}) as SchedulerWeekPayload & { data?: SchedulerAssignmentRow[] };
  const assignments = Array.isArray(obj.assignments)
    ? obj.assignments
    : Array.isArray(obj.data)
      ? obj.data
      : [];
  const dayLocks = Array.isArray(obj.dayLocks)
    ? obj.dayLocks
    : Array.isArray(obj.dayUnlocks)
      ? obj.dayUnlocks
      : [];
  const dayLockKeys = Array.isArray(obj.dayLockKeys) && obj.dayLockKeys.length > 0
    ? obj.dayLockKeys
    : Array.isArray(obj.dayUnlockKeys) && obj.dayUnlockKeys.length > 0
      ? obj.dayUnlockKeys
      : dayLocks.map((u) => `${u.designerId}|${u.date}`).filter((k) => k.includes('|'));
  return {
    assignments,
    dayLocks,
    dayUnlocks: dayLocks,
    weekStart: obj.weekStart,
    version: Number(obj.version ?? 0),
    isLocked: Boolean(obj.isLocked),
    updatedAt: obj.updatedAt,
    updatedBy: obj.updatedBy ?? null,
    dayLockKeys,
    dayUnlockKeys: dayLockKeys,
  };
}

export async function listSchedulerAssignmentsForWeek(weekStart: string, designerId?: string) {
  const q = encodeURIComponent(weekStart);
  const dq = designerId ? `&designerId=${encodeURIComponent(designerId)}` : '';
  const res = await apiClient.get<SchedulerWeekPayload | SchedulerAssignmentRow[]>(
    `/scheduler-assignments?weekStart=${q}${dq}`,
  );
  return normalizeWeekPayload(res);
}

/** Lock a weekend day for a designer (packing skips it like a holiday). */
export function createSchedulerDayLock(input: { designerId: string; date: string; reason?: string }) {
  return apiClient.post<SchedulerDayLock>('/scheduler-assignments/day-locks', input);
}

/** Remove a weekend day lock (day becomes open again). */
export function deleteSchedulerDayLock(input: { designerId: string; date: string }) {
  return apiClient.delete<{ ok: true }>('/scheduler-assignments/day-locks', input);
}

/** @deprecated Use createSchedulerDayLock */
export function createSchedulerDayUnlock(input: { designerId: string; date: string; reason?: string }) {
  return createSchedulerDayLock(input);
}

/** @deprecated Use deleteSchedulerDayLock */
export function deleteSchedulerDayUnlock(input: { designerId: string; date: string }) {
  return deleteSchedulerDayLock(input);
}

export function getSchedulerWeekMeta(weekStart: string) {
  return apiClient.get<SchedulerWeekMeta>(`/scheduler-assignments/week/${encodeURIComponent(weekStart)}/meta`);
}

export function saveSchedulerWeekSnapshot(
  weekStart: string,
  payload: {
    version: number;
    assignments: SaveSchedulerAssignmentInput[];
    resolvedFragmentIds?: string[];
    affectedTaskIds?: string[];
    overflow?: SchedulerOverflowInput[];
  },
) {
  return apiClient.put<{
    weekStart: string;
    version: number;
    isLocked: boolean;
    updatedAt: Date;
    updatedBy: string | null;
    assignments: SchedulerAssignmentRow[];
    overflowPlacements: SchedulerOverflowPlacement[];
    unplacedOverflow: SchedulerUnplacedOverflow[];
  }>(`/scheduler-assignments/week/${encodeURIComponent(weekStart)}`, payload);
}

export function lockSchedulerWeek(weekStart: string) {
  return apiClient.post<SchedulerWeekMeta>(`/scheduler-assignments/week/${encodeURIComponent(weekStart)}/lock`, {});
}

export function unlockSchedulerWeek(weekStart: string) {
  return apiClient.delete<SchedulerWeekMeta>(`/scheduler-assignments/week/${encodeURIComponent(weekStart)}/lock`);
}

/**
 * Wipes all future scheduler assignments for a task. Pass `expectedAssignmentIds` (the
 * assignment row ids the caller believes make up the task's current full state) to have the
 * server reject the wipe if a live row exists outside that set — e.g. a sibling scheduled in
 * a week the caller never loaded — instead of silently deleting it.
 */
export function clearTaskFromSchedule(taskId: string, expectedAssignmentIds?: string[]) {
  // Empty arrays must be treated as "omit guard" — `[]` is truthy and would send
  // `?expectedAssignmentIds=`, which the backend interprets as an empty expected set
  // and then rejects any live row (false "Another scheduled part changed").
  const ids = (expectedAssignmentIds ?? []).map((id) => String(id ?? '').trim()).filter(Boolean);
  const q = ids.length > 0
    ? `?expectedAssignmentIds=${encodeURIComponent(ids.join(','))}`
    : '';
  return apiClient.delete(`/scheduler-assignments/task/${encodeURIComponent(taskId)}${q}`);
}

/** Backend fragment/detach endpoints use UNASSIGNED; sidebar UI uses lowercase unassigned. */
function normalizeFragmentApiStatus(status: string): 'UNASSIGNED' | 'ON_HOLD' {
  return status === 'ON_HOLD' ? 'ON_HOLD' : 'UNASSIGNED';
}

export function detachAssignmentPart(
  assignmentId: string,
  status: 'UNASSIGNED' | 'ON_HOLD' | 'unassigned',
) {
  return apiClient.post<{ fragmentId: string }>(
    `/scheduler-assignments/${encodeURIComponent(assignmentId)}/detach`,
    { status: normalizeFragmentApiStatus(status) },
  );
}

export function updateFragmentStatus(
  fragmentId: string,
  status: 'UNASSIGNED' | 'ON_HOLD' | 'unassigned',
) {
  return apiClient.post(
    `/scheduler-assignments/fragments/${encodeURIComponent(fragmentId)}/status`,
    { status: normalizeFragmentApiStatus(status) },
  );
}

export function updateOvertimeRequestSchedulerAction(
  requestId: string,
  action: 'ON_HOLD' | 'UNASSIGN',
) {
  return apiClient.post(
    `/scheduler-assignments/overtime-requests/${encodeURIComponent(requestId)}/action`,
    { action },
  );
}

export type DesignerStatsBar = {
  designerId: string;
  weekStart: string;
  workLoad: { tasks: number; hours: number };
  workTill: { label: string; hours: number };
  monthlyTaskCount: number;
  weeklyCompletedCount: number;
  score: number;
};

/** Shared StatsBar numbers — same formulas as DesignerDashboard task/week helpers. */
export function getDesignerStatsBar(designerId: string, weekStart: string) {
  const q = encodeURIComponent(weekStart);
  const d = encodeURIComponent(designerId);
  return apiClient.get<DesignerStatsBar>(
    `/scheduler-assignments/designer-stats?designerId=${d}&weekStart=${q}`,
  );
}
