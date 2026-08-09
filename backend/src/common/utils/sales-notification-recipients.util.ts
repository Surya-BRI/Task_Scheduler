import { normalizePersonName } from './project-team-names.util';

export type SalesUserRef = { id: string; fullName: string };

export type SalesProjectRef = {
  salesPerson?: string | null;
  createdById?: string | null;
};

export function compactPersonName(value: string): string {
  return normalizePersonName(value).replace(/\s+/g, '');
}

/**
 * Match salesperson users to a project for notifications.
 * Supports ERP compacted names (e.g. user "Fahad" ↔ project "FahadQuazi").
 * Falls back to project.createdById, then optional extra user ids (e.g. TASK_CREATED actor).
 */
export function matchSalesUsersToProject(
  project: SalesProjectRef | null | undefined,
  salesUsers: SalesUserRef[],
  options?: { extraUserIds?: string[] },
): SalesUserRef[] {
  if (!salesUsers.length) return [];

  const byId = new Map(salesUsers.map((u) => [u.id, u]));
  const result = new Map<string, SalesUserRef>();

  const add = (user: SalesUserRef | undefined) => {
    if (user) result.set(user.id, user);
  };

  const salesPerson = String(project?.salesPerson ?? '').trim();
  if (salesPerson) {
    const projectKey = compactPersonName(salesPerson);
    for (const user of salesUsers) {
      if (!user.fullName) continue;
      const full = normalizePersonName(user.fullName);
      const compact = compactPersonName(user.fullName);
      const first = full.split(/\s+/)[0] ?? '';
      if (
        projectKey.includes(compact) ||
        compact.includes(projectKey) ||
        (first.length >= 3 && projectKey.includes(first.replace(/\s+/g, '')))
      ) {
        add(user);
      }
    }
  }

  const createdById = project?.createdById?.trim();
  if (createdById) add(byId.get(createdById));

  for (const id of options?.extraUserIds ?? []) {
    if (id) add(byId.get(id));
  }

  // When ERP salesPerson is blank, still allow project creator / extras (already added).
  return [...result.values()];
}
