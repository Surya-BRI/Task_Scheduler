// TEMPORARY: Production demo login support.
// Remove before public release.

export const DEMO_ROLE_ORDER = ['HOD', 'QS', 'Sales', 'Designer'] as const;

export type DemoRole = (typeof DEMO_ROLE_ORDER)[number];

export type DemoUser = {
  label: string;
  email: string;
  password: string;
  badge: string;
  color: string;
  role: DemoRole;
};

export const DEMO_USERS_BY_ROLE: Record<DemoRole, DemoUser[]> = {
  HOD: [
    {
      label: 'HOD — Sarah Mitchell',
      email: 'sarah.mitchell@bluerhine.com',
      password: 'hod123',
      badge: 'HOD',
      color: 'bg-violet-100 text-violet-700 border-violet-200',
      role: 'HOD',
    },
    {
      label: 'HOD — James Carter',
      email: 'james.carter@bluerhine.com',
      password: 'hod456',
      badge: 'HOD',
      color: 'bg-purple-100 text-purple-700 border-purple-200',
      role: 'HOD',
    },
    {
      label: 'HOD — Priya Sharma',
      email: 'priya.sharma@bluerhine.com',
      password: 'hod789',
      badge: 'HOD',
      color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
      role: 'HOD',
    },
  ],
  QS: [
    {
      label: 'QS — Ojas',
      email: 'qs.team@bluerhine.com',
      password: 'qs1234',
      badge: 'QS',
      color: 'bg-amber-100 text-amber-700 border-amber-200',
      role: 'QS',
    },
  ],
  Sales: [
    {
      label: 'Sales — Rehman',
      email: 'rehman@bluerhine.com',
      password: 'rehman123',
      badge: 'Sales',
      color: 'bg-orange-100 text-orange-700 border-orange-200',
      role: 'Sales',
    },
  ],
  Designer: [
    {
      label: 'Designer — Alex Johnson',
      email: 'alex.johnson@bluerhine.com',
      password: 'alex123',
      badge: 'Designer',
      color: 'bg-blue-100 text-blue-700 border-blue-200',
      role: 'Designer',
    },
    {
      label: 'Designer — Alexander Allen',
      email: 'alexander.allen@bluerhine.com',
      password: 'alex123',
      badge: 'Designer',
      color: 'bg-cyan-100 text-cyan-700 border-cyan-200',
      role: 'Designer',
    },
    {
      label: 'Designer — Benjamin Harris',
      email: 'benjamin.harris@bluerhine.com',
      password: 'ben123',
      badge: 'Designer',
      color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      role: 'Designer',
    },
  ],
};

export function getDemoAccounts(): DemoUser[] {
  return DEMO_ROLE_ORDER.flatMap((role) => DEMO_USERS_BY_ROLE[role]);
}
