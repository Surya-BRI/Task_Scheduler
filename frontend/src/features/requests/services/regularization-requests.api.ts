import { apiClient } from '@/lib/api-client';

export type RegularizationRequestDto = {
  id: string;
  designerId: string;
  designerName: string;
  employeeId: string;
  departmentName: string;
  taskId: string;
  taskName: string;
  date: string;
  duration: string;
  reason: string;
  notes: string;
  status: 'unsubmitted' | 'Pending' | 'Approved' | 'Rejected';
  approverId: string | null;
  approverName: string | null;
  approverRemarks: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

export function listRegularizationRequests(designerId?: string) {
  const qs = designerId ? `?designerId=${encodeURIComponent(designerId)}` : '';
  return apiClient.get<RegularizationRequestDto[]>(`/regularization-requests${qs}`);
}

export function listRegularizationPendingApprovals() {
  return apiClient.get<RegularizationRequestDto[]>('/regularization-requests/pending-approvals');
}

export function getRegularizationRequest(id: string) {
  return apiClient.get<RegularizationRequestDto>(`/regularization-requests/${encodeURIComponent(id)}`);
}

export function createRegularizationRequest(data: {
  designerId: string;
  taskId: string;
  date: string;
  duration: string;
  reason: string;
  notes?: string;
  status?: string;
}) {
  return apiClient.post<RegularizationRequestDto>('/regularization-requests', data);
}

export function reviewRegularizationRequest(
  id: string,
  data: { status: 'Approved' | 'Rejected'; remarks?: string; comments?: string },
) {
  return apiClient.post<RegularizationRequestDto>(
    `/regularization-requests/${encodeURIComponent(id)}/review`,
    data,
  );
}

export function listRegularizationTaskOptions(designerId: string) {
  return apiClient.get<Array<{ id: string; name: string }>>(
    `/regularization-requests/task-options?designerId=${encodeURIComponent(designerId)}`,
  );
}
