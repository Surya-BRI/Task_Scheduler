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
 * working day (skipping weekends/holidays/full-day leave, possibly in a later week) and creates
 * the assignment row(s) itself, atomically with the rest of this save.
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

export function listSchedulerAssignmentsForWeek(weekStart: string, designerId?: string) {
  const q = encodeURIComponent(weekStart);
  const dq = designerId ? `&designerId=${encodeURIComponent(designerId)}` : '';
  return apiClient.get<SchedulerAssignmentRow[]>(`/scheduler-assignments?weekStart=${q}${dq}`);
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
  const q = expectedAssignmentIds
    ? `?expectedAssignmentIds=${encodeURIComponent(expectedAssignmentIds.join(','))}`
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
