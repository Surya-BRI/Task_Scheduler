import { apiClient } from '@/lib/api-client';

export type DraftWorkPeekResult = {
  workedSeconds: number;
  workedHours: number;
  hadRunningTimer: boolean;
};

export type FreezeDraftWorkSessionResult = {
  workedSeconds: number;
  workedHours: number;
  frozen: boolean;
  hadRunningTimer: boolean;
  sessionClosed?: boolean;
};

export function peekDraftWorkSession(taskId: string, designerId: string) {
  const q = encodeURIComponent(designerId);
  return apiClient.get<DraftWorkPeekResult>(
    `/tasks/${encodeURIComponent(taskId)}/draft-work-peek?designerId=${q}`,
  );
}

export function freezeDraftWorkSession(
  taskId: string,
  designerId: string,
  options?: { closeSession?: boolean },
) {
  return apiClient.post<FreezeDraftWorkSessionResult>(
    `/tasks/${encodeURIComponent(taskId)}/freeze-draft-session`,
    { designerId, closeSession: options?.closeSession ?? true },
  );
}
