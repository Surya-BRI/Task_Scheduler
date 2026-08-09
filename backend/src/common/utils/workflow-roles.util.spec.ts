import { UserRole } from '../constants/roles.enum';
import {
  hasDepartmentManagerAccess,
  hasHodWorkflowAccess,
  hasHrApproverAccess,
} from './workflow-roles.util';

describe('workflow-roles.util', () => {
  it('treats HOD and SALESPERSON as department managers (tasks/projects)', () => {
    expect(hasDepartmentManagerAccess(UserRole.HOD)).toBe(true);
    expect(hasDepartmentManagerAccess(UserRole.SALESPERSON)).toBe(true);
    expect(hasDepartmentManagerAccess(UserRole.DESIGNER)).toBe(false);
  });

  it('includes admin roles in HOD workflow access', () => {
    expect(hasHodWorkflowAccess(UserRole.SALESPERSON)).toBe(true);
    expect(hasHodWorkflowAccess(UserRole.ADMIN)).toBe(true);
    expect(hasHodWorkflowAccess(UserRole.DESIGNER)).toBe(false);
  });

  it('limits leave/OT/regularization approval to HOD only', () => {
    expect(hasHrApproverAccess(UserRole.HOD)).toBe(true);
    expect(hasHrApproverAccess(UserRole.SALESPERSON)).toBe(false);
    expect(hasHrApproverAccess(UserRole.DESIGNER)).toBe(false);
  });
});
