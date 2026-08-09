/** Roles that can run the department workflow (HOD flow integrated into Sales for tasks/projects). */
export const DEPARTMENT_MANAGER_ROLES = ['HOD', 'SALESPERSON']

/** Roles with elevated task/project management (matches backend HOD workflow). */
export const HOD_WORKFLOW_ROLES = ['HOD', 'SALESPERSON', 'ADMIN', 'PROJECT_MANAGER']

/** Leave / OT / regularization approvers — HOD only (Sales does not approve HR requests). */
export const HR_APPROVER_ROLES = ['HOD']

export function hasDepartmentManagerAccess(role) {
  return DEPARTMENT_MANAGER_ROLES.includes(role)
}

export function hasHodWorkflowAccess(role) {
  return HOD_WORKFLOW_ROLES.includes(role)
}

export function hasHrApproverAccess(role) {
  return HR_APPROVER_ROLES.includes(role)
}

export function isSalesperson(role) {
  return role === 'SALESPERSON'
}
