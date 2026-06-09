import { apiClient } from '@/lib/api-client';

export type LeaveRequestDto = {
  id: string;
  designerId: string;
  requesterName?: string;
  reason: string;
  fromDate: string;
  toDate: string;
  status: string;
  type: string;
  createdBy: string;
  approverId?: string | null;
  approverName?: string | null;
  approverRemarks?: string | null;
  reviewedAt?: string | null;
  revokedById?: string | null;
  revokedByName?: string | null;
  revokedAt?: string | null;
  revocationReason?: string | null;
  createdAt?: string;
};

export function fetchLeaveRequests(designerId?: string) {
  const qs = new URLSearchParams();
  if (designerId) qs.set('designerId', designerId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiClient.get<LeaveRequestDto[]>(`/requests${suffix}`);
}

export function fetchLeavePendingApprovals() {
  return apiClient.get<LeaveRequestDto[]>('/requests/pending-approvals');
}

export function fetchLeaveTeamRequests(params?: { status?: string; designerId?: string }) {
  const qs = new URLSearchParams();
  if (params?.status?.trim()) qs.set('status', params.status.trim());
  if (params?.designerId?.trim()) qs.set('designerId', params.designerId.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiClient.get<LeaveRequestDto[]>(`/requests/team-requests${suffix}`);
}

export function createLeaveRequest(data: {
  userId: string;
  type: string;
  startDate: string;
  endDate?: string;
  reason?: string;
}) {
  return apiClient.post<LeaveRequestDto>('/requests', data);
}

export function updateLeaveRequest(
  id: string,
  data: {
    type?: string;
    startDate?: string;
    endDate?: string;
    reason?: string;
  },
) {
  return apiClient.patch<LeaveRequestDto>(`/requests/${encodeURIComponent(id)}`, data);
}

export function cancelLeaveRequest(id: string) {
  return apiClient.post<LeaveRequestDto>(`/requests/${encodeURIComponent(id)}/cancel`, {});
}

export function reviewLeaveRequest(id: string, data: { status: 'APPROVED' | 'REJECTED'; remarks?: string }) {
  return apiClient.post<LeaveRequestDto>(`/requests/${encodeURIComponent(id)}/review`, data);
}

export function revokeLeaveRequest(id: string, data: { reason: string }) {
  return apiClient.post<LeaveRequestDto>(`/requests/${encodeURIComponent(id)}/revoke`, data);
}

/** @deprecated Prefer reviewLeaveRequest */
export function updateLeaveRequestStatus(id: string, status: string) {
  return apiClient.patch<LeaveRequestDto>(`/requests/${encodeURIComponent(id)}/status`, { status });
}
