import { apiClient } from './api-client';
import { buildSessionForUser } from './designers';
import {
  clearSession,
  getSession,
  markSessionLoaded,
  setSession,
} from './session';

type MeResponse = {
  id: string;
  userName: string;
  role: string | null;
};

function mapMeToSession(user: MeResponse) {
  return buildSessionForUser({
    id: user.id,
    userName: user.userName,
    role: user.role ?? 'DESIGNER',
  });
}

export async function fetchSession() {
  const user = await apiClient.get<MeResponse>('/auth/me');
  const session = mapMeToSession(user);
  setSession(session);
  return session;
}

export async function ensureSession() {
  const existing = getSession();
  if (existing) return existing;
  try {
    return await fetchSession();
  } catch {
    clearSession();
    markSessionLoaded();
    return null;
  }
}

export async function logoutSession() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    // Cookie may already be cleared server-side.
  } finally {
    clearSession();
  }
}
