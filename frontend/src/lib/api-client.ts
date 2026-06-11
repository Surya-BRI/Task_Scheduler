import { parseApiErrorMessage } from './api-error';
import { clearAccessToken, getAccessToken } from './auth-token';
import { env } from './env';
import { dateReviver } from './utils';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  if (!(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  } else {
    headers.delete('Content-Type');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${env.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });
  } catch (err) {
    const hint =
      err instanceof TypeError
        ? `Cannot reach the API at ${env.apiBaseUrl}. Start the backend (npm run dev:backend) and confirm NEXT_PUBLIC_API_BASE_URL.`
        : err instanceof Error
          ? err.message
          : 'Network request failed';
    throw new Error(hint);
  }

  if (response.status === 401) {
    clearAccessToken();
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(parseApiErrorMessage(errorBody, response.status));
  }

  // 204 No Content — return undefined cast to T (callers that use void are fine)
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  // Use a date-aware reviver so ISO strings are automatically parsed into
  // Date objects — this keeps all date fields as Date throughout the app.
  const text = await response.text();
  if (!text.trim()) {
    return undefined as unknown as T;
  }
  try {
    return JSON.parse(text, dateReviver) as T;
  } catch {
    throw new Error(`Invalid JSON response from server: ${text.slice(0, 200)}`);
  }
}

export const apiClient = {
  get<T>(path: string): Promise<T> {
    return request(path);
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
  delete<T>(path: string): Promise<T> {
    return request(path, { method: 'DELETE' });
  },
};

