/**
 * In-memory session cache backed by /auth/me (httpOnly cookie auth).
 * Do not persist role or identity in localStorage — prevents client-side tampering.
 */

import { buildSessionForUser } from './designers';

export type AppSession = ReturnType<typeof buildSessionForUser> & {
  designerId?: string;
  erpDesignerId?: string;
};

let sessionCache: AppSession | null = null;
let sessionLoaded = false;

function hydrateSession(session: AppSession | null): AppSession | null {
  if (!session || typeof session !== 'object') return session;
  if (session.role === 'DESIGNER') {
    if (!session.designerId && session.id) {
      session.designerId = session.id;
    }
    if (!session.erpDesignerId && session.id) {
      session.erpDesignerId = session.id;
    }
  }
  return session;
}

export function getSession() {
  return sessionCache;
}

export function setSession(session: AppSession) {
  sessionCache = hydrateSession(session);
  sessionLoaded = true;
}

export function clearSession() {
  sessionCache = null;
  sessionLoaded = false;
  clearLegacyAuthStorage();
}

export function isSessionLoaded() {
  return sessionLoaded;
}

export function markSessionLoaded() {
  sessionLoaded = true;
}

export function clearLegacyAuthStorage() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('br_session');
  localStorage.removeItem('task_scheduler_access_token');
}

export function getHomeRoute(session: AppSession | null) {
  if (!session) return '/login';
  if (session.role === 'HOD') return '/design-list';
  if (session.role === 'DESIGNER') return '/design-list/tasks';
  if (session.role === 'SALESPERSON') return '/sales/tasks';
  if (session.role === 'QS') return '/qs/projects';
  return '/design-list';
}
