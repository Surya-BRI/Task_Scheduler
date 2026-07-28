import {
  effectiveWorkSessionSeconds,
  normalizeWorkSeconds,
  workedHoursFromSeconds,
} from './task-work-session-time.util';

describe('task-work-session-time.util', () => {
  it('effectiveWorkSessionSeconds adds elapsed since runStartedAt', () => {
    const runStartedAt = new Date('2026-01-01T10:00:00.000Z');
    const now = new Date('2026-01-01T10:25:00.000Z');
    expect(effectiveWorkSessionSeconds(0, runStartedAt, now)).toBe(25 * 60);
    expect(effectiveWorkSessionSeconds(600, runStartedAt, now)).toBe(600 + 25 * 60);
  });

  it('normalizeWorkSeconds keeps exact whole seconds', () => {
    expect(normalizeWorkSeconds(0)).toBe(0);
    expect(normalizeWorkSeconds(1)).toBe(1);
    expect(normalizeWorkSeconds(200)).toBe(200);
    expect(normalizeWorkSeconds(601.9)).toBe(601);
  });

  it('workedHoursFromSeconds returns 2dp hours from exact seconds', () => {
    expect(workedHoursFromSeconds(25 * 60)).toBe(0.42);
    expect(workedHoursFromSeconds(20 * 60)).toBe(0.33);
    expect(workedHoursFromSeconds(200)).toBe(0.06); // 3m20s — no 5-minute round-up
  });
});
