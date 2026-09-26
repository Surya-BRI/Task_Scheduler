import { UserRole } from '../constants/roles.enum';

/** Roles that can run the department workflow (HOD flow integrated into Sales for tasks/projects). */
export const DEPARTMENT_MANAGER_ROLES: UserRole[] = [
  UserRole.HOD,
  UserRole.ADMIN,
  UserRole.SALESPERSON,
];

/** Roles with elevated task/project management (matches frontend HOD action panel). */
export const HOD_WORKFLOW_ROLES: UserRole[] = [
  UserRole.HOD,
  UserRole.SALESPERSON,
  UserRole.ADMIN,
  UserRole.PROJECT_MANAGER,
];

export const HR_APPROVER_ROLES: UserRole[] = [UserRole.HOD, UserRole.ADMIN];

/**
 * HOD-level access. ADMIN has every permission an HOD has, but is a distinct role: it is not
 * an HOD for assignment purposes (HOD pick lists, reviewer HOD) — only for what it may do.
 */
export function hasHodEquivalentAccess(role: UserRole | string | null | undefined): boolean {
  return role === UserRole.HOD || role === UserRole.ADMIN;
}

export function hasDepartmentManagerAccess(role: UserRole | string): boolean {
  return DEPARTMENT_MANAGER_ROLES.includes(role as UserRole);
}

export function hasHodWorkflowAccess(role: UserRole | string): boolean {
  return HOD_WORKFLOW_ROLES.includes(role as UserRole);
}

export function hasHrApproverAccess(role: UserRole | string): boolean {
  return HR_APPROVER_ROLES.includes(role as UserRole);
}
