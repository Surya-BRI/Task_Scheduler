import { UserRole } from '../constants/roles.enum';
import {
  hasDepartmentManagerAccess,
  hasHodWorkflowAccess,
} from './workflow-roles.util';

describe('workflow-roles.util', () => {
  it('treats HOD and SALESPERSON as department managers', () => {
    expect(hasDepartmentManagerAccess(UserRole.HOD)).toBe(true);
    expect(hasDepartmentManagerAccess(UserRole.SALESPERSON)).toBe(true);
    expect(hasDepartmentManagerAccess(UserRole.DESIGNER)).toBe(false);
  });

  it('includes admin roles in HOD workflow access', () => {
    expect(hasHodWorkflowAccess(UserRole.SALESPERSON)).toBe(true);
    expect(hasHodWorkflowAccess(UserRole.ADMIN)).toBe(true);
    expect(hasHodWorkflowAccess(UserRole.DESIGNER)).toBe(false);
  });
});
