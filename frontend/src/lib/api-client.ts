import { clearAccessToken, getAccessToken } from './auth-token';
import { env } from './env';
import { dateReviver } from './utils';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${env.apiBaseUrl}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    clearAccessToken();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || 'API request failed');
  }

  // Use a date-aware reviver so ISO strings are automatically parsed into
  // Date objects — this keeps all date fields as Date throughout the app.
  const text = await response.text();
  return JSON.parse(text, dateReviver) as T;
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request(path);
  },
  post<T>(path: string, body: unknown): Promise<T> {
    return request(path, { method: 'POST', body: JSON.stringify(body) });
  },
  patch<T>(path: string, body: unknown): Promise<T> {
    return request(path, { method: 'PATCH', body: JSON.stringify(body) });
  },
};

