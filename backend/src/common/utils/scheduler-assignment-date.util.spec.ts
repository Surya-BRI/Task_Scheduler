import {
  assignmentCalendarDate,
  isAssignmentOnOrAfter,
  mondayWeekStartUtc,
  selectFutureAssignmentIds,
  startOfUtcDay,
} from './scheduler-assignment-date.util';

describe('scheduler-assignment-date.util', () => {
  it('derives Monday week start for mid-week dates', () => {
    // Wednesday 2026-08-05 → Monday 2026-08-03
    expect(mondayWeekStartUtc(new Date('2026-08-05T12:00:00.000Z')).toISOString()).toBe(
      '2026-08-03T00:00:00.000Z',
    );
  });

  it('computes assignment calendar date from weekStart + dayIndex', () => {
    const weekStart = new Date('2026-08-03T00:00:00.000Z');
    expect(assignmentCalendarDate(weekStart, 2)?.toISOString()).toBe('2026-08-05T00:00:00.000Z');
  });

  it('treats remaining days in the current week as on-or-after today', () => {
    const today = startOfUtcDay(new Date('2026-08-05T15:00:00.000Z')); // Wed
    const weekStart = new Date('2026-08-03T00:00:00.000Z'); // Mon
    expect(isAssignmentOnOrAfter({ weekStartDate: weekStart, dayIndex: 1 }, today)).toBe(false); // Tue
    expect(isAssignmentOnOrAfter({ weekStartDate: weekStart, dayIndex: 2 }, today)).toBe(true); // Wed
    expect(isAssignmentOnOrAfter({ weekStartDate: weekStart, dayIndex: 4 }, today)).toBe(true); // Fri
  });

  it('selects only future assignment ids by calendar date, not weekStart', () => {
    const today = new Date('2026-08-05T00:00:00.000Z');
    const weekStart = new Date('2026-08-03T00:00:00.000Z');
    const ids = selectFutureAssignmentIds(
      [
        { id: 'mon', weekStartDate: weekStart, dayIndex: 0 },
        { id: 'wed', weekStartDate: weekStart, dayIndex: 2 },
        { id: 'fri', weekStartDate: weekStart, dayIndex: 4 },
      ],
      today,
    );
    expect(ids).toEqual(['wed', 'fri']);
  });
});
