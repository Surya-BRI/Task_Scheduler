import { describe, expect, it } from 'vitest';
import {
  MAX_DAILY_HOURS,
  assertHoursWithinDeadline,
  countWorkingDaysUntil,
  maxHoursForDeadline,
} from './task-deadline-hours';

describe('task-deadline-hours', () => {
  it('exposes 12h daily ceiling', () => {
    expect(MAX_DAILY_HOURS).toBe(12);
  });

  it('counts two weekdays as 2 working days / max 24h', () => {
    // Mon 2026-08-03 → Tue 2026-08-04
    const from = new Date(2026, 7, 3);
    const deadline = new Date(2026, 7, 4);
    expect(countWorkingDaysUntil(deadline, from)).toBe(2);
    expect(maxHoursForDeadline(deadline, from)).toBe(24);
  });

  it('allows hours equal to max and blocks hours above max', () => {
    const from = new Date(2026, 7, 3);
    const deadline = new Date(2026, 7, 4);
    expect(assertHoursWithinDeadline(24, deadline, from)).toMatchObject({ ok: true, maxHours: 24 });
    const blocked = assertHoursWithinDeadline(25, deadline, from);
    expect(blocked).toMatchObject({
      ok: false,
      message: 'Estimated hours (25) exceed the maximum of 24h for 2 working days (12h/day).',
    });
  });

  it('weekend-only span counts Sat/Sun as working days (same as weekdays)', () => {
    // Sat 2026-08-08 → Sun 2026-08-09
    const from = new Date(2026, 7, 8);
    const deadline = new Date(2026, 7, 9);
    expect(countWorkingDaysUntil(deadline, from)).toBe(2);
    expect(maxHoursForDeadline(deadline, from)).toBe(24);
    expect(assertHoursWithinDeadline(2, deadline, from)).toMatchObject({ ok: true, maxHours: 24 });
    expect(assertHoursWithinDeadline(24, deadline, from)).toMatchObject({ ok: true, maxHours: 24 });
  });

  it('same-day Sunday deadline allows up to 12h (by EOD)', () => {
    const from = new Date(2026, 7, 9);
    const deadline = new Date(2026, 7, 9);
    expect(countWorkingDaysUntil(deadline, from)).toBe(1);
    expect(maxHoursForDeadline(deadline, from)).toBe(12);
    expect(assertHoursWithinDeadline(2, deadline, from)).toMatchObject({ ok: true, maxHours: 12 });
  });

  it('includes Sat/Sun when spanning a weekend', () => {
    // Fri 2026-08-07 → Mon 2026-08-10 → Fri, Sat, Sun, Mon = 4
    const from = new Date(2026, 7, 7);
    const deadline = new Date(2026, 7, 10);
    expect(countWorkingDaysUntil(deadline, from)).toBe(4);
    expect(maxHoursForDeadline(deadline, from)).toBe(48);
  });
});
