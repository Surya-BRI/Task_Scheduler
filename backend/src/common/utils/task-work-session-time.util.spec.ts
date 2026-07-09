import {
  effectiveWorkSessionSeconds,
  roundWorkSecondsUpTo5Min,
  workedHoursFromSeconds,
} from './task-work-session-time.util';

describe('task-work-session-time.util', () => {
  it('effectiveWorkSessionSeconds adds elapsed since runStartedAt', () => {
    const runStartedAt = new Date('2026-01-01T10:00:00.000Z');
    const now = new Date('2026-01-01T10:25:00.000Z');
    expect(effectiveWorkSessionSeconds(0, runStartedAt, now)).toBe(25 * 60);
    expect(effectiveWorkSessionSeconds(600, runStartedAt, now)).toBe(600 + 25 * 60);
  });

  it('roundWorkSecondsUpTo5Min rounds up to 5-minute buckets', () => {
    expect(roundWorkSecondsUpTo5Min(0)).toBe(0);
    expect(roundWorkSecondsUpTo5Min(1)).toBe(300);
    expect(roundWorkSecondsUpTo5Min(600)).toBe(600);
    expect(roundWorkSecondsUpTo5Min(601)).toBe(900);
  });

  it('workedHoursFromSeconds returns 2dp hours', () => {
    expect(workedHoursFromSeconds(25 * 60)).toBe(0.42);
    expect(workedHoursFromSeconds(20 * 60)).toBe(0.33);
  });
});
