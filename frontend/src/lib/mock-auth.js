const SESSION_KEY = 'br_session';

export function mockLogout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function getSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
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
