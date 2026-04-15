import { apiClient } from '@/lib/api-client';
import type { LoginResponse } from '@/types/auth.types';

export function login(email: string, password: string) {
  return apiClient.post<LoginResponse>('/auth/login', { email, password });
}

export function register(payload: {
  email: string;
  password: string;
  fullName: string;
  role: 'HOD' | 'DESIGNER';
}) {
  return apiClient.post('/auth/register', payload);
}
