import { UserRole } from '../constants/roles.enum';

/**
 * ERP roleName -> Scheduler role. ERP has dozens of granular roles; only the ones with a real
 * Scheduler equivalent can log into the Scheduler app. Single source of truth — every service that
 * resolves a user's Scheduler role from ERP's role tables must use this map.
 *
 * Admin / Sub Admin are their own ADMIN role: HOD-level access (see hasHodEquivalentAccess) but
 * they are NOT HODs, so they never show up in HOD pick lists or as a task's reviewer HOD.
 */
export const ERP_ROLE_MAP: Record<string, UserRole> = {
  'Design HOD': UserRole.HOD,
  'Design Head': UserRole.HOD,
  Admin: UserRole.ADMIN,
  'Sub Admin': UserRole.ADMIN,
  SalesRep: UserRole.SALESPERSON,
  'Sales Coordinator': UserRole.SALESPERSON,
  Designer: UserRole.DESIGNER,
  QS: UserRole.QS,
};
