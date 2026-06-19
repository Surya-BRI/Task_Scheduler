import { apiClient } from '@/lib/api-client';

export type ActivitySegment = 
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; href: string };

export interface TeamActivity {
  id: string;
  action: string;
  kind: string;
  user: {
    id: string;
    name: string;
    avatarUrl: string;
  };
  messageSegments: ActivitySegment[];
  occurredAt: string;
  liked: boolean;
  individualEligible: boolean;
  monthIndex: number;
  year: number;
  priority: string;
  project?: string;
  projectId?: string | null;
  projectNo?: string | null;
  projectName?: string | null;
  taskId?: string | null;
  taskNo?: string | null;
  taskName?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  team?: string;
}

export function fetchTeamActivities(params?: { limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiClient.get<TeamActivity[]>(`/activities${suffix}`);
}

export function fetchUserActivities(userId: string, params?: { limit?: number }) {
  const qs = new URLSearchParams({ userId });
  if (params?.limit != null) qs.set('limit', String(params.limit));
  return apiClient.get<TeamActivity[]>(`/activities?${qs.toString()}`);
}

export interface ActivityTimelineItem {
  id: string;
  action: string;
  occurredAt: string;
  actor: {
    id: string;
    name: string;
    avatarUrl: string;
  };
  task: {
    id: string;
    taskNo?: string;
    opNo?: string;
    title?: string;
    priority?: string;
    dueDate?: string | null;
    assigneeName?: string | null;
    hodName?: string | null;
  } | null;
  project: {
    id: string;
    projectNo?: string;
    name?: string;
  } | null;
  details: Record<string, unknown>;
  summary: string;
  severity: 'info' | 'success' | 'warning';
}

export interface ActivityTimelineResponse {
  data: ActivityTimelineItem[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

function buildTimelineSuffix(params?: { limit?: number; cursor?: string }) {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.cursor) qs.set('cursor', params.cursor);
  return qs.toString() ? `?${qs.toString()}` : '';
}

export function fetchTaskActivities(taskId: string, params?: { limit?: number; cursor?: string }) {
  return apiClient.get<ActivityTimelineResponse>(
    `/activities/task/${encodeURIComponent(taskId)}${buildTimelineSuffix(params)}`,
  );
}

export function fetchProjectActivities(
  projectId: string,
  params?: { limit?: number; cursor?: string },
) {
  return apiClient.get<ActivityTimelineResponse>(
    `/activities/project/${encodeURIComponent(projectId)}${buildTimelineSuffix(params)}`,
  );
}
