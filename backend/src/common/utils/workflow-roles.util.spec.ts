import { UserRole } from '../constants/roles.enum';
import {
  hasDepartmentManagerAccess,
  hasHodWorkflowAccess,
  hasHodEquivalentAccess,
  hasHrApproverAccess,
  isBackupHodReviewer,
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

  it('limits leave/OT/regularization approval to HOD and ADMIN', () => {
    expect(hasHrApproverAccess(UserRole.HOD)).toBe(true);
    expect(hasHrApproverAccess(UserRole.ADMIN)).toBe(true);
    expect(hasHrApproverAccess(UserRole.SALESPERSON)).toBe(false);
    expect(hasHrApproverAccess(UserRole.DESIGNER)).toBe(false);
  });

  it('treats ADMIN as HOD-equivalent for access, but no other role', () => {
    expect(hasHodEquivalentAccess(UserRole.HOD)).toBe(true);
    expect(hasHodEquivalentAccess(UserRole.ADMIN)).toBe(true);
    expect(hasHodEquivalentAccess(UserRole.SALESPERSON)).toBe(false);
    expect(hasHodEquivalentAccess(undefined)).toBe(false);
  });

  describe('isBackupHodReviewer', () => {
    const ORIGINAL_ENV = process.env.BACKUP_HOD_REVIEWER_USER_IDS;

    afterEach(() => {
      process.env.BACKUP_HOD_REVIEWER_USER_IDS = ORIGINAL_ENV;
    });

    it('is false when the env var is unset', () => {
      delete process.env.BACKUP_HOD_REVIEWER_USER_IDS;
      expect(isBackupHodReviewer('208')).toBe(false);
    });

    it('matches ids listed in BACKUP_HOD_REVIEWER_USER_IDS, ignoring whitespace', () => {
      process.env.BACKUP_HOD_REVIEWER_USER_IDS = '208, 202';
      expect(isBackupHodReviewer('208')).toBe(true);
      expect(isBackupHodReviewer('202')).toBe(true);
      expect(isBackupHodReviewer('216')).toBe(false);
      expect(isBackupHodReviewer(undefined)).toBe(false);
    });
  });
});
