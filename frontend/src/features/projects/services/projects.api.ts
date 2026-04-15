import { apiClient } from '@/lib/api-client';
import type { ProjectItem } from '@/types/project.types';

export function listProjects() {
  return apiClient.get<ProjectItem[]>('/projects');
}

export function createProject(payload: { name: string; description?: string }) {
  return apiClient.post<ProjectItem>('/projects', payload);
}
