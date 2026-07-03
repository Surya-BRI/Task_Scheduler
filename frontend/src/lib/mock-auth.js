import { getSession, getHomeRoute, setSession, clearSession, clearLegacyAuthStorage } from './session';
import { logoutSession, fetchSession, ensureSession } from './session-api';

export { getSession, getHomeRoute, setSession, clearSession, fetchSession, ensureSession };

/** @deprecated Use logoutSession() — kept for Navbar compatibility. */
export async function mockLogout() {
  await logoutSession();
  clearLegacyAuthStorage();
}
