import { apiClient } from '@/lib/api-client';

export function login(email, password) {
  return apiClient.post('/auth/login', { email, password });
}
