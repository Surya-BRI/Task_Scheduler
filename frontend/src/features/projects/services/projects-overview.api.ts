import { apiClient } from '@/lib/api-client';
import { singleflight } from '@/lib/singleflight';

export function getProjectsOverview(weekStart: string): Promise<any> {
  const key = `dashboard/projects-overview?weekStart=${weekStart}`;
  return singleflight(key, () => apiClient.get(`/dashboard/projects-overview?weekStart=${weekStart}`));
}
