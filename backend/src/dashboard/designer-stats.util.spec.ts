import {
  computeDesignerTaskBarStats,
  computeDesignerWeekWorkloadStats,
  getTaskCompletionDate,
  resolveAssignmentScheduledHours,
} from './designer-stats.util';

describe('designer-stats.util', () => {
  it('prefers completedAt over updatedAt for closed date', () => {
    const date = getTaskCompletionDate({
      status: 'CLIENT_ACCEPTED',
      completedAt: '2026-07-10T12:00:00.000Z',
      updatedAt: '2026-07-19T12:00:00.000Z',
    });
    expect(date?.toISOString()).toBe('2026-07-10T12:00:00.000Z');
  });

  it('computes monthly / weekly closed + score like Requests StatsBar', () => {
    const now = new Date(2026, 6, 19, 12, 0, 0, 0); // local Jul 19
    const weekStart = new Date(2026, 6, 13, 0, 0, 0, 0); // Mon
    const weekEnd = new Date(2026, 6, 19, 23, 59, 59, 999);
    const stats = computeDesignerTaskBarStats(
      [
        { status: 'IN_PROGRESS', updatedAt: '2026-07-18T00:00:00.000Z' },
        {
          status: 'CLIENT_ACCEPTED',
          completedAt: '2026-07-15T10:00:00.000Z',
        },
        {
          status: 'CLIENT_REJECTED',
          completedAt: '2026-07-16T10:00:00.000Z',
        },
        {
          status: 'CLIENT_ACCEPTED',
          completedAt: '2026-06-20T10:00:00.000Z',
        },
      ],
      { now, viewWeekStart: weekStart, viewWeekEnd: weekEnd },
    );

    expect(stats.monthlyTaskCount).toBe(2);
    expect(stats.weeklyCompletedCount).toBe(2);
    expect(stats.score).toBe(75); // 3 closed / 4 tasks
  });

  it('resolveAssignmentScheduledHours subtracts OT when scheduledHours absent', () => {
    expect(
      resolveAssignmentScheduledHours({
        assignedHours: 10,
        approvedOvertimeHours: 2,
      }),
    ).toBe(8);
    expect(
      resolveAssignmentScheduledHours({
        scheduledHours: 6,
        assignedHours: 10,
        approvedOvertimeHours: 2,
      }),
    ).toBe(6);
  });

  it('sums Mon–Fri slots/hours and work-till like live schedule StatsBar', () => {
    const weekDates = Array.from({ length: 7 }, (_, i) => new Date(2026, 6, 13 + i));
    const result = computeDesignerWeekWorkloadStats(
      [
        { dayIndex: 0, scheduledHours: 4, approvedOvertimeHours: 0 },
        { dayIndex: 2, scheduledHours: 6, approvedOvertimeHours: 2 },
        { dayIndex: 4, requestType: 'LEAVE', leaveHours: 8 },
        { dayIndex: 5, scheduledHours: 4 }, // Sat ignored
      ],
      weekDates,
    );

    expect(result.workLoad.tasks).toBe(3);
    expect(result.workLoad.hours).toBe(20);
    expect(result.lastWorkDayIndex).toBe(4);
    expect(result.workTill.hours).toBe(8);
    expect(result.workTill.label).toMatch(/Friday/i);
  });
});
