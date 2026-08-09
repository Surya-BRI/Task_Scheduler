/**
 * User-facing API/network messages — never expose URLs, env vars, npm commands, or stacks.
 */

export const USER_NETWORK_ERROR =
  'Unable to connect to the server. Please check your connection and try again.';

export const USER_SERVER_ERROR = 'Something went wrong on our side. Please try again in a moment.';

export const USER_UNAVAILABLE_ERROR =
  'The service is temporarily unavailable. Please try again shortly.';

export const USER_NOT_FOUND_ERROR = 'The requested item could not be found.';

const TECH_LEAK_RE =
  /NEXT_PUBLIC_|BACKEND_ORIGIN|npm run |prisma:setup|localhost:\d+|127\.0\.0\.1|:\d{4,5}\/api|\/api\/v1|ECONNREFUSED|ENOTFOUND|fetch failed|AggregateError|at [A-Za-z0-9_./\\-]+:\d+|WinSCP|pm2 |dist\/main|node_modules|schema\.prisma|SQL Server|stack trace|backend logs/i;

export function looksTechnicalMessage(message: string): boolean {
  const text = String(message ?? '').trim();
  if (!text) return false;
  if (TECH_LEAK_RE.test(text)) return true;
  if (text.length > 280) return true;
  return false;
}

/** Sanitize any thrown value into a short message safe to show in UI / toasts. */
export function toUserFacingError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : fallback;
  const text = String(raw ?? '').trim();
  if (!text) return fallback;
  if (looksTechnicalMessage(text)) {
    if (/reach|connect|network|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(text)) {
      return USER_NETWORK_ERROR;
    }
    return fallback;
  }
  return text;
}

/**
 * Turn Nest/API error bodies into a short user-facing message (never raw JSON).
 */
export function parseApiErrorMessage(body: string, status?: number): string {
  const trimmed = body.trim();
  if (!trimmed) {
    if (status === 500 || status === 502) return USER_SERVER_ERROR;
    if (status === 503) return USER_UNAVAILABLE_ERROR;
    if (status === 401) return 'Invalid email or password.';
    if (status === 404) return USER_NOT_FOUND_ERROR;
    return 'Something went wrong. Please try again.';
  }

  try {
    const data = JSON.parse(trimmed) as {
      statusCode?: number;
      message?: string | { message?: string | string[]; error?: string };
    };

    const msg = data.message;
    if (Array.isArray(msg)) {
      return toUserFacingError(msg.join(', '), USER_SERVER_ERROR);
    }
    if (typeof msg === 'string') {
      if (msg === 'Internal server error' && (status === 500 || status === 502)) {
        return USER_SERVER_ERROR;
      }
      if (msg === 'Invalid credentials' || msg.toLowerCase().includes('unauthorized')) {
        return 'Invalid email or password.';
      }
      return toUserFacingError(
        msg,
        status === 503 ? USER_UNAVAILABLE_ERROR : status === 404 ? USER_NOT_FOUND_ERROR : USER_SERVER_ERROR,
      );
    }

    if (msg && typeof msg === 'object') {
      if (typeof msg.message === 'string') {
        return toUserFacingError(msg.message, USER_SERVER_ERROR);
      }
      if (Array.isArray(msg.message)) {
        return toUserFacingError(msg.message.join(', '), USER_SERVER_ERROR);
      }
      if (typeof msg.error === 'string') {
        return toUserFacingError(msg.error, USER_SERVER_ERROR);
      }
    }
  } catch {
    if (trimmed.length <= 200 && !looksTechnicalMessage(trimmed)) {
      return trimmed;
    }
  }

  if (status === 401) return 'Invalid email or password.';
  if (status === 404) return USER_NOT_FOUND_ERROR;
  if (status === 503) return USER_UNAVAILABLE_ERROR;
  if (status === 500 || status === 502) return USER_SERVER_ERROR;
  return 'Something went wrong. Please try again.';
}
