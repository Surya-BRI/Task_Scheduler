import { parseApiErrorMessage, toUserFacingError, USER_NETWORK_ERROR } from '@/lib/api-error';

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
  let response: Response;
  try {
    response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    throw new Error(toUserFacingError(err, USER_NETWORK_ERROR));
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(parseApiErrorMessage(text, response.status));
  }

  if (!text.trim()) {
    throw new Error('Unable to sign in right now. Please try again.');
  }

  try {
    return JSON.parse(text) as LoginResponse;
  } catch {
    throw new Error('Unable to sign in right now. Please try again.');
  }
}
