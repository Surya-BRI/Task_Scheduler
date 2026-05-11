import { apiClient } from '@/lib/api-client';
import { formatDateForInput } from '@/lib/utils';
import type { TaskItem } from '@/types/task.types';

export function listTasks(page = 1, limit = 20) {
  return apiClient.get<TaskItem[]>(`/tasks?page=${page}&limit=${limit}`);
}

export function createTask(payload: {
  title: string;
  projectId: string;
  description?: string;
  /** Pass a Date object or ISO string — will be serialized to ISO string */
  dueDate?: Date | string | null;
}) {
  return apiClient.post<TaskItem>('/tasks', {
    ...payload,
    // Serialize Date → ISO string for the API; keep null/undefined as-is
    dueDate: payload.dueDate instanceof Date
      ? payload.dueDate.toISOString()
      : payload.dueDate ?? undefined,
  });
}

export function updateTask(
  taskId: string,
  payload: {
    title?: string;
    description?: string;
    /** Pass a Date object or ISO string — will be serialized to ISO string */
    dueDate?: Date | string | null;
  },
) {
  return apiClient.patch<TaskItem>(`/tasks/${taskId}`, {
    ...payload,
    dueDate: payload.dueDate instanceof Date
      ? payload.dueDate.toISOString()
      : payload.dueDate ?? undefined,
  });
}

export function assignTask(taskId: string, assigneeId: string) {
  return apiClient.patch<TaskItem>(`/tasks/${taskId}/assign`, { assigneeId });
}

export function updateTaskStatus(taskId: string, status: 'PENDING' | 'WIP' | 'COMPLETED') {
  return apiClient.patch<TaskItem>(`/tasks/${taskId}/status`, { status });
}

/** Helper: format a task's dueDate for display */
export function formatTaskDueDate(task: TaskItem): string {
  if (!task.dueDate) return '—';
  return task.dueDate instanceof Date
    ? task.dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : formatDateForInput(task.dueDate);
}

