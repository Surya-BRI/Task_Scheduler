import { clearAccessToken } from './auth-token';
import { slugForDesignerEmail } from './designers';

const SESSION_KEY = 'br_session';

function hydrateSession(session) {
  if (!session || typeof session !== 'object') return session;
  if (session.role === 'DESIGNER') {
    if (!session.designerId && session.email) {
      session.designerId = slugForDesignerEmail(session.email) ?? session.id ?? null;
    }
    if (!session.erpDesignerId && session.id) {
      session.erpDesignerId = session.id;
    }
  }
  return session;
}

export function mockLogout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
    clearAccessToken();
  }
}

export function getSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? hydrateSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function getHomeRoute(session) {
  if (!session) return '/login';
  if (session.role === 'HOD') return '/design-list';
  if (session.role === 'DESIGNER') return '/design-list/my-work';
  return '/design-list';
}
