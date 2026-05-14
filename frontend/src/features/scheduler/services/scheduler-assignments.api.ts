import { apiClient } from '@/lib/api-client';

export type SchedulerAssignmentRow = {
  id: string;
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: number;
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
};

export function listSchedulerAssignmentsForWeek(weekStart: string) {
  const q = encodeURIComponent(weekStart);
  return apiClient.get<SchedulerAssignmentRow[]>(`/scheduler-assignments?weekStart=${q}`);
}
