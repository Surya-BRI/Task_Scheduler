/** Demo / seed designer profiles (route slug d1–d20). */
export const DESIGNER_PROFILES = [
  { id: 'd1', name: 'Alex Johnson', email: 'alex.johnson@bluerhine.com' },
  { id: 'd2', name: 'Alexander Allen', email: 'alexander.allen@bluerhine.com' },
  { id: 'd3', name: 'Benjamin Harris', email: 'benjamin.harris@bluerhine.com' },
  { id: 'd4', name: 'Chloe Wright', email: 'chloe.wright@bluerhine.com' },
  { id: 'd5', name: 'David Adams', email: 'david.adams@bluerhine.com' },
  { id: 'd6', name: 'Ella Young', email: 'ella.young@bluerhine.com' },
  { id: 'd7', name: 'Emily Davis', email: 'emily.davis@bluerhine.com' },
  { id: 'd8', name: 'Ethan Anderson', email: 'ethan.anderson@bluerhine.com' },
  { id: 'd9', name: 'Grace Green', email: 'grace.green@bluerhine.com' },
  { id: 'd10', name: 'Hannah Perez', email: 'hannah.perez@bluerhine.com' },
  { id: 'd11', name: 'Designer 11' },
  { id: 'd12', name: 'Designer 12' },
  { id: 'd13', name: 'Designer 13' },
  { id: 'd14', name: 'Designer 14' },
  { id: 'd15', name: 'Designer 15' },
  { id: 'd16', name: 'Designer 16' },
  { id: 'd17', name: 'Designer 17' },
  { id: 'd18', name: 'Designer 18' },
  { id: 'd19', name: 'Designer 19' },
  { id: 'd20', name: 'Designer 20' },
];

// User ids are now ERP ErpAuthUsers.userId — decimal bigints, not GUIDs.
const NUMERIC_ID_RE = /^\d+$/;

export function isUuidString(value) {
  return NUMERIC_ID_RE.test(String(value ?? '').trim());
}

export function slugForDesignerEmail(email) {
  const normalized = String(email ?? '').trim().toLowerCase();
  return DESIGNER_PROFILES.find((p) => p.email?.toLowerCase() === normalized)?.id ?? null;
}

export function profileForRouteId(routeId) {
  const id = String(routeId ?? '').trim();
  if (!id) return null;
  return (
    DESIGNER_PROFILES.find((p) => p.id === id) ??
    DESIGNER_PROFILES.find((p) => p.erpDesignerId === id) ??
    null
  );
}

export function buildSessionForUser(user) {
  const role = user.role;
  const displayName = user.userName ?? user.fullName ?? user.username ?? '';
  const session = {
    id: user.id,
    username: user.username ?? user.userName,
    name: displayName,
    role,
    initials: displayName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  };

  if (role === 'DESIGNER') {
    session.designerId = user.id;
    session.erpDesignerId = user.id;
  }

  return session;
}
