import { apiClient } from '@/lib/api-client';

export type SchedulerAssignmentRow = {
  id: string;
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: number;
  scheduledHours?: number;
  approvedOvertimeHours?: number;
  parentId: string | null;
  splitIndex: number | null;
  totalParts: number | null;
  weekStartDate: Date;
  weekEndDate: Date;
  notes: string | null;
  isLocked: boolean;
  assignedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  overtimeRequestIds?: string[];
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
  payload: { version: number; assignments: SaveSchedulerAssignmentInput[] },
) {
  return apiClient.put<{
    weekStart: string;
    version: number;
    isLocked: boolean;
    updatedAt: Date;
    updatedBy: string | null;
    assignments: SchedulerAssignmentRow[];
  }>(`/scheduler-assignments/week/${encodeURIComponent(weekStart)}`, payload);
}

export function lockSchedulerWeek(weekStart: string) {
  return apiClient.post<SchedulerWeekMeta>(`/scheduler-assignments/week/${encodeURIComponent(weekStart)}/lock`, {});
}

export function unlockSchedulerWeek(weekStart: string) {
  return apiClient.delete<SchedulerWeekMeta>(`/scheduler-assignments/week/${encodeURIComponent(weekStart)}/lock`);
}

export function clearTaskFromSchedule(taskId: string) {
  return apiClient.delete(`/scheduler-assignments/task/${encodeURIComponent(taskId)}`);
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
