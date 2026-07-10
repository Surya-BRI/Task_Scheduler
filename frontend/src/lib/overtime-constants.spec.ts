import { describe, expect, it } from 'vitest';
import {
  MAX_OVERTIME_HOURS_PER_DAY,
  OVERTIME_REQUESTED_HOURS_OPTIONS,
  parseRequestedHoursLabel,
} from './overtime-constants';

describe('overtime-constants', () => {
  it('exposes 8 options up to max hours', () => {
    expect(MAX_OVERTIME_HOURS_PER_DAY).toBe(8);
    expect(OVERTIME_REQUESTED_HOURS_OPTIONS).toHaveLength(8);
    expect(OVERTIME_REQUESTED_HOURS_OPTIONS[7]).toBe('8 hours');
  });

  it('parseRequestedHoursLabel', () => {
    expect(parseRequestedHoursLabel('3 hours')).toBe(3);
    expect(parseRequestedHoursLabel('8 hours')).toBe(8);
  });
});
