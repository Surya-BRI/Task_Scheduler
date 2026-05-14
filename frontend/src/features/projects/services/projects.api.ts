import { apiClient } from '@/lib/api-client';
import type { ProjectItem, ProjectDetail, ProjectListResponse } from '@/types/project.types';

export type ProjectFilters = {
  status?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
};

function buildQuery(filters: ProjectFilters): string {
  const params = new URLSearchParams();
  if (filters.status)   params.set('status', filters.status);
  if (filters.category) params.set('category', filters.category);
  if (filters.search)   params.set('search', filters.search);
  if (filters.page)     params.set('page', String(filters.page));
  if (filters.limit)    params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** GET /projects — paginated with optional filters */
export function listProjects(filters: ProjectFilters = {}) {
  return apiClient.get<ProjectListResponse>(`/projects${buildQuery(filters)}`);
}

/** GET /projects/:id — project detail with tasks list */
export function getProject(id: string) {
  return apiClient.get<ProjectDetail>(`/projects/${id}`);
}

/** POST /projects */
export function createProject(payload: {
  name: string;
  projectNo?: string;
  category?: string;
  businessUnit?: string;
  description?: string;
  status?: string;
  salesPerson?: string;
}) {
  return apiClient.post<ProjectItem>('/projects', payload);
}

/** PATCH /projects/:id */
export function updateProject(
  id: string,
  payload: Partial<{
    name: string;
    description: string;
    category: string;
    businessUnit: string;
    status: string;
    salesPerson: string;
  }>,
) {
  return apiClient.patch<ProjectItem>(`/projects/${id}`, payload);
}
