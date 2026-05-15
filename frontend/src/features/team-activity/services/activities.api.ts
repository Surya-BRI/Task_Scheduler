import { apiClient } from '@/lib/api-client';

export type ActivitySegment = 
  | { type: 'text'; value: string }
  | { type: 'link'; label: string; href: string };

export interface TeamActivity {
  id: string;
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
  team?: string;
}

export function fetchTeamActivities(params?: { limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiClient.get<TeamActivity[]>(`/activities${suffix}`);
}
