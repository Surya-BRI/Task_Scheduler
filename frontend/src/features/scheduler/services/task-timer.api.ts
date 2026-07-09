import { apiClient } from '@/lib/api-client';

export type FreezeDraftWorkSessionResult = {
  workedSeconds: number;
  workedHours: number;
  frozen: boolean;
  hadRunningTimer: boolean;
};

export function freezeDraftWorkSession(taskId: string, designerId: string) {
  return apiClient.post<FreezeDraftWorkSessionResult>(
    `/tasks/${encodeURIComponent(taskId)}/freeze-draft-session`,
    { designerId },
  );
}
