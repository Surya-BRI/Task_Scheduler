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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidString(value) {
  return UUID_RE.test(String(value ?? '').trim());
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
  const session = {
    id: user.id,
    email: user.email,
    name: user.fullName,
    role,
    initials: user.fullName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
  };

  if (role === 'DESIGNER') {
    session.designerId = slugForDesignerEmail(user.email) ?? 'd1';
    session.erpDesignerId = user.id;
  }

  return session;
}
