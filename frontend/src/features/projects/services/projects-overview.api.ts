import { apiClient } from '@/lib/api-client';

export function getProjectsOverview(weekStart: string): Promise<any> {
  return apiClient.get(`/dashboard/projects-overview?weekStart=${weekStart}`);
}
