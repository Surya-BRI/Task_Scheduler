import { assertHoursWithinDeadline, countWorkingDaysUntil, MAX_DAILY_HOURS } from './task-deadline-hours.util';

describe('task-deadline-hours.util', () => {
  it('exposes the same 12h daily ceiling used at task creation', () => {
    expect(MAX_DAILY_HOURS).toBe(12);
  });

  it('blocks hours above workingDays × 12h', () => {
    const from = new Date(2026, 7, 3);
    const deadline = new Date(2026, 7, 4);
    expect(countWorkingDaysUntil(deadline, from)).toBe(2);
    expect(assertHoursWithinDeadline(24, deadline, from).ok).toBe(true);
    expect(assertHoursWithinDeadline(25, deadline, from)).toMatchObject({
      ok: false,
      workingDays: 2,
      maxHours: 24,
    });
  });
});
