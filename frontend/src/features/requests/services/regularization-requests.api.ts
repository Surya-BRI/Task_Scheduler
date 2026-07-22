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

export function listRegularizationTeamRequests(filters?: { status?: string; designerId?: string }) {
  const params = new URLSearchParams();
  if (filters?.status?.trim()) params.set('status', filters.status.trim());
  if (filters?.designerId?.trim()) params.set('designerId', filters.designerId.trim());
  const qs = params.toString();
  return apiClient.get<RegularizationRequestDto[]>(
    `/regularization-requests/team-requests${qs ? `?${qs}` : ''}`,
  );
}

export function getRegularizationRequest(id: string) {
  return apiClient.get<RegularizationRequestDto>(`/regularization-requests/${encodeURIComponent(id)}`);
}

export function createRegularizationRequest(data: {
  designerId: string;
  regularizationType?: 'task' | 'non-task';
  taskId?: string;
  projectId?: string;
  workDetails?: string;
  date: string;
  duration: string;
  reason: string;
  notes?: string;
  status?: string;
}) {
  return apiClient.post<RegularizationRequestDto>('/regularization-requests', data);
}

/** Rejection requires `comments` (1–2000 chars). Approval may optionally send `remarks`. */
export function reviewRegularizationRequest(
  id: string,
  data: { status: 'Approved' | 'Rejected'; remarks?: string; comments?: string },
) {
  const payload =
    data.status === 'Rejected'
      ? {
          status: 'Rejected' as const,
          comments: String(data.comments ?? data.remarks ?? '').trim(),
        }
      : {
          status: 'Approved' as const,
          ...(String(data.remarks ?? '').trim()
            ? { remarks: String(data.remarks).trim() }
            : {}),
        };

  return apiClient.post<RegularizationRequestDto>(
    `/regularization-requests/${encodeURIComponent(id)}/review`,
    payload,
  );
}

export function listRegularizationTaskOptions(designerId: string, date: string) {
  return apiClient.get<Array<{ id: string; name: string }>>(
    `/regularization-requests/task-options?designerId=${encodeURIComponent(designerId)}&date=${encodeURIComponent(date)}`,
  );
}
