import { parseApiErrorMessage, toUserFacingError, USER_NETWORK_ERROR } from './api-error';
import { clearSession } from './session';
import { env } from './env';
import { dateReviver } from './utils';

function redirectToLogin(expired = false) {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/login')) return;
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  const suffix = expired ? '&expired=1' : '';
  window.location.href = `/login?next=${next}${suffix}`;
}

/** Clear the httpOnly access_token cookie (e.g. after expiry or invalid JWT). */
async function clearStaleAuthCookie() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    // Best-effort; middleware also allows /login when expired=1.
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  } else {
    headers.delete('Content-Type');
  }

  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch (err) {
    if (typeof console !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.warn('[api] network failure', env.apiBaseUrl, err);
    }
    throw new Error(toUserFacingError(err, USER_NETWORK_ERROR));
  }

  if (response.status === 401) {
    const isLoginAttempt = path === '/auth/login' || path.endsWith('/auth/login');
    if (!isLoginAttempt) {
      clearSession();
      await clearStaleAuthCookie();
      redirectToLogin(true);
    }
    throw new Error(isLoginAttempt ? 'Invalid email or password.' : 'Unauthorized');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(parseApiErrorMessage(errorBody, response.status));
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as unknown as T;
  }
  try {
    return JSON.parse(text, dateReviver) as T;
  } catch {
    throw new Error('Received an invalid response from the server. Please try again.');
  }
}

const inflightGetRequests = new Map<string, Promise<unknown>>();

export const apiClient = {
  get<T>(path: string): Promise<T> {
    if (inflightGetRequests.has(path)) {
      return inflightGetRequests.get(path) as Promise<T>;
    }
    const promise = request<T>(path).finally(() => {
      inflightGetRequests.delete(path);
    });
    inflightGetRequests.set(path, promise);
    return promise;
  },
  post<T>(path: string, body: unknown): Promise<T> {
    const isFormData = body instanceof FormData;
    return request(path, { method: 'POST', body: isFormData ? body : JSON.stringify(body) });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    const isFormData = body instanceof FormData;
    return request(path, { method: 'PATCH', body: isFormData ? body : JSON.stringify(body) });
  },
  put<T>(path: string, body: unknown): Promise<T> {
    const isFormData = body instanceof FormData;
    return request(path, { method: 'PUT', body: isFormData ? body : JSON.stringify(body) });
  },
  delete<T>(path: string, body?: unknown): Promise<T> {
    return request(path, {
      method: 'DELETE',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  },
};
