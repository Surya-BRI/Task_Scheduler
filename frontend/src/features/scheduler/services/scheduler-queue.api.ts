import { apiClient } from '@/lib/api-client';

export type SchedulerTaskSummary = {
  id: string;
  opNo: string | null;
  title: string | null;
  signType: string | null;
  revisionCode: string | null;
  designType: string | null;
  disciplineType: string | null;
  status: string;
  priority: string | null;
  assigneeId: string | null;
  holdPreviousStatus: string | null;
  projectId: string | null;
  updatedAt: string | Date;
  estimatedHours: number;
  hasTaskDesigners: boolean;
  project: {
    id: string;
    name: string | null;
    projectNo: string | null;
    category: string | null;
    technicalHead: string | null;
    teamLead: string | null;
    subTeamLead: string | null;
    designers: string | null;
  } | null;
};

export function fetchSchedulerQueue() {
  return apiClient.get<{ data: SchedulerTaskSummary[] }>('/tasks/scheduler-queue');
}
