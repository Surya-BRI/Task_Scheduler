const LOCAL_BACKEND = 'http://localhost:7000';
const DEFAULT_PROD_BACKEND = 'https://task-scheduler.app-brisigns.com';

/** Server-side origin of the Nest API (no /api/v1 suffix). Used for Next rewrites and auth BFF routes. */
export function resolveBackendOrigin(): string {
  const explicit =
    process.env.API_PROXY_TARGET ??
    process.env.BACKEND_ORIGIN ??
    process.env.INTERNAL_API_ORIGIN;
  if (explicit?.trim()) {
    return explicit.trim().replace(/\/$/, '');
  }

  const publicApi = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (publicApi?.startsWith('http://') || publicApi?.startsWith('https://')) {
    return publicApi.replace(/\/api\/v1\/?$/, '');
  }

  if (process.env.NODE_ENV === 'development') {
    return LOCAL_BACKEND;
  }

  return DEFAULT_PROD_BACKEND;
}

export function resolveBackendApiBase(): string {
  return `${resolveBackendOrigin()}/api/v1`;
}
