/**
 * Turn Nest/API error bodies into a short user-facing message (never raw JSON).
 */
export function parseApiErrorMessage(body: string, status?: number): string {
  const trimmed = body.trim();
  if (!trimmed) {
    if (status === 500) {
      return 'The server encountered an error. If you are developing locally, ensure the backend is running and NEXT_PUBLIC_API_BASE_URL points to it.';
    }
    if (status === 401) return 'Invalid email or password.';
    return 'Something went wrong. Please try again.';
  }

  try {
    const data = JSON.parse(trimmed) as {
      statusCode?: number;
      message?: string | { message?: string | string[]; error?: string };
    };

    const msg = data.message;
    if (typeof msg === 'string') {
      if (msg === 'Internal server error' && status === 500) {
        return 'The server encountered an error. Ensure the backend is running, the database is reachable, and schema is applied (run npm run prisma:setup from the repo root).';
      }
      if (msg === 'Invalid credentials' || msg.toLowerCase().includes('unauthorized')) {
        return 'Invalid email or password.';
      }
      return msg;
    }

    if (msg && typeof msg === 'object') {
      if (typeof msg.message === 'string') return msg.message;
      if (Array.isArray(msg.message)) return msg.message.join(', ');
      if (typeof msg.error === 'string') return msg.error;
    }
  } catch {
    // not JSON — use plain text if short enough
    if (trimmed.length <= 200) return trimmed;
  }

  if (status === 401) return 'Invalid email or password.';
  if (status === 404) {
    return 'The requested resource was not found. If you are developing locally, ensure the backend is running and includes the latest API routes.';
  }
  if (status === 503) {
    return 'The service is temporarily unavailable. Check that the database is reachable and migrations have been applied.';
  }
  if (status === 500) {
    return 'The server encountered an error. Try again later or use the local API for development.';
  }
  return 'Something went wrong. Please try again.';
}
