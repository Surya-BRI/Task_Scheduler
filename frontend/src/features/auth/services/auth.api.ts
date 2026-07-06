import { parseApiErrorMessage } from '@/lib/api-error';

export interface LoginResponse {
  accessToken?: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

/** Same-origin BFF route sets the httpOnly cookie on the frontend host for middleware. */
export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(parseApiErrorMessage(text, response.status));
  }

  if (!text.trim()) {
    throw new Error('Empty authentication response');
  }

  return JSON.parse(text) as LoginResponse;
}
