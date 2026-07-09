import { UserRole } from '../constants/roles.enum';

/** Roles that can run the department workflow (HOD flow integrated into Sales). */
export const DEPARTMENT_MANAGER_ROLES: UserRole[] = [
  UserRole.HOD,
  UserRole.SALESPERSON,
];

/** Roles with elevated task/project management (matches frontend HOD action panel). */
export const HOD_WORKFLOW_ROLES: UserRole[] = [
  UserRole.HOD,
  UserRole.SALESPERSON,
  UserRole.ADMIN,
  UserRole.PROJECT_MANAGER,
];

export function hasDepartmentManagerAccess(role: UserRole | string): boolean {
  return DEPARTMENT_MANAGER_ROLES.includes(role as UserRole);
}

export function hasHodWorkflowAccess(role: UserRole | string): boolean {
  return HOD_WORKFLOW_ROLES.includes(role as UserRole);
}
