/** Roles that can run the department workflow (HOD flow integrated into Sales). */
export const DEPARTMENT_MANAGER_ROLES = ['HOD', 'SALESPERSON']

/** Roles with elevated task/project management (matches backend HOD workflow). */
export const HOD_WORKFLOW_ROLES = ['HOD', 'SALESPERSON', 'ADMIN', 'PROJECT_MANAGER']

export function hasDepartmentManagerAccess(role) {
  return DEPARTMENT_MANAGER_ROLES.includes(role)
}

export function hasHodWorkflowAccess(role) {
  return HOD_WORKFLOW_ROLES.includes(role)
}

export function isSalesperson(role) {
  return role === 'SALESPERSON'
}
