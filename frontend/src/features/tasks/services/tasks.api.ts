import { apiClient } from '@/lib/api-client';
import type { TaskItem, TaskListResponse, TaskStatusSummary } from '@/types/task.types';

export type TaskFilters = {
  projectId?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

function buildQuery(filters: TaskFilters): string {
  const params = new URLSearchParams();
  if (filters.projectId)  params.set('projectId', filters.projectId);
  if (filters.status)     params.set('status', filters.status);
  if (filters.priority)   params.set('priority', filters.priority);
  if (filters.assigneeId) params.set('assigneeId', filters.assigneeId);
  if (filters.search)     params.set('search', filters.search);
  if (filters.page)       params.set('page', String(filters.page));
  if (filters.limit)      params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** GET /tasks — paginated with optional filters */
export function listTasks(filters: TaskFilters = {}) {
  return apiClient.get<TaskListResponse>(`/tasks${buildQuery(filters)}`);
}

/** GET /tasks/summary — status count breakdown */
export function getTaskStatusSummary() {
  return apiClient.get<TaskStatusSummary>('/tasks/summary');
}

/** GET /tasks/:id */
export function getTask(id: string) {
  return apiClient.get<TaskItem>(`/tasks/${id}`);
}

/** POST /tasks */
export function createTask(payload: {
  title: string;
  projectId: string;
  opNo?: string;
  description?: string;
  priority?: string;
  assigneeId?: string;
  dueDate?: Date | string | null;
}) {
  return apiClient.post<TaskItem>('/tasks', {
    ...payload,
    dueDate:
      payload.dueDate instanceof Date
        ? payload.dueDate.toISOString()
        : payload.dueDate ?? undefined,
  });
}

/** PATCH /tasks/:id */
export function updateTask(
  taskId: string,
  payload: {
    title?: string;
    description?: string;
    priority?: string;
    dueDate?: Date | string | null;
  },
) {
  return apiClient.patch<TaskItem>(`/tasks/${taskId}`, {
    ...payload,
    dueDate:
      payload.dueDate instanceof Date
        ? payload.dueDate.toISOString()
        : payload.dueDate ?? undefined,
  });
}

/** PATCH /tasks/:id/assign */
export function assignTask(taskId: string, assigneeId: string) {
  return apiClient.patch<TaskItem>(`/tasks/${taskId}/assign`, { assigneeId });
}

/** PATCH /tasks/:id/status */
export function updateTaskStatus(
  taskId: string,
  status: 'PENDING' | 'WIP' | 'COMPLETED' | 'REVISION' | 'APPROVED',
) {
  return apiClient.patch<TaskItem>(`/tasks/${taskId}/status`, { status });
}

/** Helper: format a task's dueDate for display */
export function formatTaskDueDate(task: TaskItem): string {
  if (!task.dueDate) return '—';
  const d = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
