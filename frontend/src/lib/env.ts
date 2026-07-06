/**
 * Central environment config for the frontend.
 * Reads NEXT_PUBLIC_* vars at runtime so they can be swapped per-environment
 * without a code change.
 */
const LOCAL_API = 'http://localhost:7000/api/v1';
/** Same-origin path; Next.js rewrites proxy this to the Nest backend in production. */
const PRODUCTION_API = '/api/v1';

function isCrossOriginApiUrl(apiBase: string): boolean {
  if (!apiBase.startsWith('http://') && !apiBase.startsWith('https://')) {
    return false;
  }
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const apiOrigin = new URL(apiBase.replace(/\/api\/v1\/?$/, '') || apiBase).origin;
    return apiOrigin !== window.location.origin;
  } catch {
    return true;
  }
}

function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const isDev = process.env.NODE_ENV === 'development';

  if (!configured) {
    return isDev ? LOCAL_API : PRODUCTION_API;
  }

  if (configured.startsWith('/')) {
    return configured;
  }

  if (isDev) {
    return configured;
  }

  // Deployed builds must use same-origin /api/v1 so httpOnly cookies are sent.
  if (configured.startsWith('http://') || configured.startsWith('https://')) {
    if (typeof window !== 'undefined' && !isCrossOriginApiUrl(configured)) {
      return configured;
    }
    return PRODUCTION_API;
  }

  return configured;
}

export const env = {
  apiBaseUrl: resolveApiBaseUrl(),
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'TaskScheduler',
} as const;

if (typeof window !== 'undefined') {
  console.info('[TaskScheduler] Active backend:', env.apiBaseUrl);
}
