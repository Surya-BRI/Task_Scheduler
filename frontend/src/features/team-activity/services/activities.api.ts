import { apiClient } from '@/lib/api-client';
import { singleflight } from '@/lib/singleflight';

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

export interface TeamActivitiesPage {
  data: TeamActivity[];
  pageInfo: {
    hasMore: boolean;
    nextCursor: string | null;
  };
}

function normalizeTeamActivitiesResponse(
  res: TeamActivity[] | TeamActivitiesPage,
): TeamActivitiesPage {
  if (Array.isArray(res)) {
    return { data: res, pageInfo: { hasMore: false, nextCursor: null } };
  }
  return {
    data: Array.isArray(res?.data) ? res.data : [],
    pageInfo: {
      hasMore: Boolean(res?.pageInfo?.hasMore),
      nextCursor: res?.pageInfo?.nextCursor ?? null,
    },
  };
}

export function fetchTeamActivities(params?: {
  limit?: number;
  since?: string;
  cursor?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.since) qs.set('since', params.since);
  if (params?.cursor) qs.set('cursor', params.cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const key = `activities${suffix || '?limit=default'}`;
  return singleflight(key, () =>
    apiClient
      .get<TeamActivity[] | TeamActivitiesPage>(`/activities${suffix}`)
      .then(normalizeTeamActivitiesResponse),
  );
}

export function fetchUserActivities(
  userId: string,
  params?: { limit?: number; since?: string; cursor?: string },
) {
  const qs = new URLSearchParams({ userId });
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.since) qs.set('since', params.since);
  if (params?.cursor) qs.set('cursor', params.cursor);
  return apiClient
    .get<TeamActivity[] | TeamActivitiesPage>(`/activities?${qs.toString()}`)
    .then(normalizeTeamActivitiesResponse)
    .then((page) => page.data);
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
