import { apiClient } from '@/lib/api-client';

export type LeaveRequestDto = {
  id: string;
  designerId: string;
  reason: string;
  fromDate: string;
  toDate: string;
  status: string;
  type: string;
  createdBy: string;
};

export function fetchLeaveRequests(designerId?: string) {
  const qs = new URLSearchParams();
  if (designerId) qs.set('designerId', designerId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiClient.get<LeaveRequestDto[]>(`/requests${suffix}`);
}

export function createLeaveRequest(data: { userId: string; type: string; startDate: string; endDate?: string; reason?: string }) {
  return apiClient.post<LeaveRequestDto>('/requests', data);
}

export function updateLeaveRequestStatus(id: string, status: string) {
  return apiClient.patch<LeaveRequestDto>(`/requests/${id}/status`, { status });
}
