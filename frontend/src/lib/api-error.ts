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
        return 'The server encountered an error. Check that the API database is configured and demo users are seeded.';
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
  if (status === 500) {
    return 'The server encountered an error. Try again later or use the local API for development.';
  }
  return 'Something went wrong. Please try again.';
}
