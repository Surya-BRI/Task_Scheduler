import { apiClient } from '@/lib/api-client';

export type OvertimeRequestView = {
  id: string;
  designerId?: string | null;
  designerName?: string;
  date: string;
  projectName: string;
  taskTitle: string;
  taskName: string;
  requested: string;
  approved: string;
  status: string;
};

export function listOvertimeRequests(designerId?: string) {
  const qs = designerId ? `?designerId=${encodeURIComponent(designerId)}` : '';
  return apiClient.get<OvertimeRequestView[]>(`/overtime-requests${qs}`);
}

export function listOvertimePendingApprovals() {
  return apiClient.get<OvertimeRequestView[]>('/overtime-requests/pending-approvals');
}

export function createOvertimeRequest(data: {
  taskId: string;
  date: string;
  requestedHours: string;
  reason: string;
  estimatedRemaining?: string;
  status?: string;
  designerId?: string;
}) {
  return apiClient.post('/overtime-requests', data);
}

export function getOvertimeRequest(id: string) {
  return apiClient.get<Record<string, unknown>>(`/overtime-requests/${encodeURIComponent(id)}`);
}

export function reviewOvertimeRequest(
  id: string,
  data: {
    status: 'APPROVED_BY_MANAGER' | 'REJECTED_BY_MANAGER' | 'APPROVED' | 'REJECTED_BY_HR';
    comments?: string;
    approvedHours?: string;
  },
) {
  return apiClient.post(`/overtime-requests/${encodeURIComponent(id)}/review`, data);
}

export function listAssignedTasksForOvertime(assigneeId?: string) {
  const qs = assigneeId ? `?limit=200&assigneeId=${encodeURIComponent(assigneeId)}` : '?limit=200';
  return apiClient.get<{ data?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
    `/tasks${qs}`,
  );
}
