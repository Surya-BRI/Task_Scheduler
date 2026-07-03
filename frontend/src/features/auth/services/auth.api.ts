import { apiClient } from '@/lib/api-client';

export interface LoginResponse {
  accessToken?: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

export function loginApi(email: string, password: string): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>('/auth/login', { email, password });
}
