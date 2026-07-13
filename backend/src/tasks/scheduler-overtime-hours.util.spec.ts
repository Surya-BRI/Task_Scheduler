import {
  approvedOvertimeHoursFromRow,
  pendingOvertimeHoursFromRow,
  summarizeViewerOvertimeHours,
} from './scheduler-overtime-hours.util';

describe('scheduler-overtime-hours.util', () => {
  it('sums approved OT for today rows', () => {
    const result = summarizeViewerOvertimeHours([
      { status: 'APPROVED', approvedHours: 2, requestedHours: 2 },
      { status: 'SUBMITTED', requestedHours: 1 },
      { status: 'REJECTED', approvedHours: 5 },
    ]);
    expect(result.myApprovedOvertimeHours).toBe(2);
    expect(result.myPendingOvertimeHours).toBe(1);
  });

  it('falls back to requestedHours when approvedHours missing', () => {
    expect(approvedOvertimeHoursFromRow({ approvedHours: null, requestedHours: 3 })).toBe(3);
    expect(pendingOvertimeHoursFromRow({ requestedHours: 1.5 })).toBe(1.5);
  });
});
