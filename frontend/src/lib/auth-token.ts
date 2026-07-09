/**
 * Legacy token helpers — httpOnly cookies replaced localStorage JWT storage.
 * clearAccessToken remains for migrating stale client state.
 */
import { clearLegacyAuthStorage } from './session';

/** @deprecated JWT is stored in an httpOnly cookie; this always returns null. */
export function getAccessToken() {
  return null;
}

/** @deprecated Do not store JWT in localStorage. */
export function setAccessToken(_token: string) {
  if (typeof window === 'undefined') return;
}

export function clearAccessToken() {
  clearLegacyAuthStorage();
}
