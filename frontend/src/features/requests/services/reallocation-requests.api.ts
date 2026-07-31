import { apiClient } from '@/lib/api-client';

export type ReallocationRequestDto = {
  id: string;
  taskId: string;
  taskName: string;
  taskNo: string;
  taskStatus: string;
  projectName: string;
  requesterId: string;
  requesterName: string;
  suggestedDesignerId: string;
  suggestedDesignerName: string;
  targetDesignerId: string | null;
  targetDesignerName: string | null;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  remainingHours: number | null;
  remainingHoursMoved?: number;
  unplacedHours?: number;
  affectedWeekStarts?: string[];
  approverId: string | null;
  approverName: string | null;
  approverRemarks: string | null;
  reviewedAt: string | null;
  createdAt: string;
  linkUrl: string;
};

export function listReallocationRequests(designerId?: string) {
  const qs = designerId ? `?designerId=${encodeURIComponent(designerId)}` : '';
  return apiClient.get<ReallocationRequestDto[]>(`/reallocation-requests${qs}`);
}

export function listReallocationPendingApprovals() {
  return apiClient.get<ReallocationRequestDto[]>('/reallocation-requests/pending-approvals');
}

export function listReallocationTeamRequests(filters?: { status?: string; designerId?: string }) {
  const params = new URLSearchParams();
  if (filters?.status?.trim()) params.set('status', filters.status.trim());
  if (filters?.designerId?.trim()) params.set('designerId', filters.designerId.trim());
  const qs = params.toString();
  return apiClient.get<ReallocationRequestDto[]>(
    `/reallocation-requests/team-requests${qs ? `?${qs}` : ''}`,
  );
}

export function getReallocationRequest(id: string) {
  return apiClient.get<ReallocationRequestDto>(`/reallocation-requests/${encodeURIComponent(id)}`);
}

export function listReallocationTaskOptions(designerId: string) {
  return apiClient.get<
    Array<{ id: string; name: string; opNo?: string | null; title?: string | null; status?: string }>
  >(`/reallocation-requests/task-options?designerId=${encodeURIComponent(designerId)}`);
}

export function listReallocationEligibleDesigners(taskId: string) {
  return apiClient.get<Array<{ id: string; fullName: string }>>(
    `/reallocation-requests/eligible-designers?taskId=${encodeURIComponent(taskId)}`,
  );
}

export function createReallocationRequest(data: {
  taskId: string;
  suggestedDesignerId: string;
  reason: string;
}) {
  return apiClient.post<ReallocationRequestDto>('/reallocation-requests', data);
}

export function cancelReallocationRequest(id: string) {
  return apiClient.post<ReallocationRequestDto>(
    `/reallocation-requests/${encodeURIComponent(id)}/cancel`,
    {},
  );
}

export function reviewReallocationRequest(
  id: string,
  data: {
    status: 'Approved' | 'Rejected';
    targetDesignerId?: string;
    remarks?: string;
    comments?: string;
  },
) {
  const payload =
    data.status === 'Rejected'
      ? {
          status: 'Rejected' as const,
          remarks: String(data.remarks ?? data.comments ?? '').trim(),
        }
      : {
          status: 'Approved' as const,
          ...(data.targetDesignerId ? { targetDesignerId: data.targetDesignerId } : {}),
          ...(String(data.remarks ?? '').trim()
            ? { remarks: String(data.remarks).trim() }
            : {}),
        };

  return apiClient.post<ReallocationRequestDto>(
    `/reallocation-requests/${encodeURIComponent(id)}/review`,
    payload,
  );
}
