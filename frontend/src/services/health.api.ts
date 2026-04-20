import { apiClient } from '@/lib/api-client';

export function getHealth() {
  return apiClient.get<{ status: string; timestamp: string; uptime: number }>('/health');
}
