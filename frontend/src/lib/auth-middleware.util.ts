/**
 * Edge-safe JWT helpers for Next.js middleware.
 * Signature is not verified here — only shape/expiry — to avoid redirect loops
 * with stale cookies before the client can call /auth/logout.
 */

export function isAccessTokenExpired(token: string, nowMs = Date.now()): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as { exp?: number };
    if (typeof payload.exp !== 'number') return true;
    return payload.exp * 1000 <= nowMs;
  } catch {
    return true;
  }
}

export function hasUsableAccessToken(
  token: string | undefined | null,
  nowMs = Date.now(),
): boolean {
  if (!token) return false;
  return !isAccessTokenExpired(token, nowMs);
}

export function shouldAllowLoginPage(
  token: string | undefined | null,
  sessionExpired: boolean,
  nowMs = Date.now(),
): boolean {
  if (sessionExpired) return true;
  return !hasUsableAccessToken(token, nowMs);
}
