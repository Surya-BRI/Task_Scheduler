import { apiClient } from '@/lib/api-client';
import type { TaskItem } from '@/types/task.types';

export function listTasks(page = 1, limit = 20) {
  return apiClient.get<TaskItem[]>(`/tasks?page=${page}&limit=${limit}`);
}

export function createTask(payload: {
  title: string;
  projectId: string;
  description?: string;
  dueDate?: string;
}) {
  return apiClient.post<TaskItem>('/tasks', payload);
}

export function assignTask(taskId: string, assigneeId: string) {
  return apiClient.patch<TaskItem>(`/tasks/${taskId}/assign`, { assigneeId });
}

export function updateTaskStatus(taskId: string, status: 'PENDING' | 'WIP' | 'COMPLETED') {
  return apiClient.patch<TaskItem>(`/tasks/${taskId}/status`, { status });
}
