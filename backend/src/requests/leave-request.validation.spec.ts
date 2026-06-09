import {
  buildLeaveDateRange,
  dateRangesOverlap,
  dateRangesOverlapIso,
  dateToDateOnlyIso,
  DUPLICATE_LEAVE_ERROR_MESSAGE,
  findOverlappingLeave,
  isLeaveRangeCompleted,
  overlapErrorMessage,
  parseDateOnly,
  validateLeaveDates,
} from './leave-request.validation';

describe('leave-request.validation', () => {
  const today = '2026-06-08';

  describe('validateLeaveDates', () => {
    it('rejects past start dates', () => {
      const result = validateLeaveDates('2026-06-07', '2026-06-07', today);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('past');
    });

    it('allows today as start date', () => {
      const result = validateLeaveDates('2026-06-08', '2026-06-08', today);
      expect(result.ok).toBe(true);
    });

    it('rejects end date before start date', () => {
      const result = validateLeaveDates('2026-06-10', '2026-06-09', today);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain('End date');
    });

    it('accepts valid multi-day range', () => {
      const result = validateLeaveDates('2026-06-10', '2026-06-12', today);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.range.startDate.toISOString().slice(0, 10)).toBe('2026-06-10');
        expect(result.range.endDate.toISOString().slice(0, 10)).toBe('2026-06-12');
      }
    });
  });

  describe('dateRangesOverlapIso', () => {
    it('detects overlap on date strings', () => {
      expect(dateRangesOverlapIso('2026-06-10', '2026-06-12', '2026-06-11', '2026-06-11')).toBe(true);
      expect(dateRangesOverlapIso('2026-06-13', '2026-06-14', '2026-06-11', '2026-06-11')).toBe(false);
    });
  });

  describe('dateToDateOnlyIso', () => {
    it('uses UTC calendar parts', () => {
      expect(dateToDateOnlyIso(parseDateOnly('2026-06-11'))).toBe('2026-06-11');
    });
  });

  describe('dateRangesOverlap', () => {
    it('detects same-day overlap', () => {
      const a = buildLeaveDateRange('2026-07-01', '2026-07-01');
      const b = buildLeaveDateRange('2026-07-01', '2026-07-01');
      expect(dateRangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)).toBe(true);
    });

    it('detects partial overlap', () => {
      const a = buildLeaveDateRange('2026-07-01', '2026-07-05');
      const b = buildLeaveDateRange('2026-07-03', '2026-07-08');
      expect(dateRangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)).toBe(true);
    });

    it('detects full containment overlap', () => {
      const a = buildLeaveDateRange('2026-07-01', '2026-07-10');
      const b = buildLeaveDateRange('2026-07-03', '2026-07-05');
      expect(dateRangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)).toBe(true);
    });

    it('returns false for adjacent non-overlapping ranges', () => {
      const a = buildLeaveDateRange('2026-07-01', '2026-07-02');
      const b = buildLeaveDateRange('2026-07-03', '2026-07-04');
      expect(dateRangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)).toBe(false);
    });
  });

  describe('overlapErrorMessage', () => {
    it('returns the standard duplicate leave message', () => {
      expect(overlapErrorMessage()).toBe(DUPLICATE_LEAVE_ERROR_MESSAGE);
    });
  });

  describe('findOverlappingLeave', () => {
    const range = buildLeaveDateRange('2026-08-01', '2026-08-03');

    it('ignores rejected and cancelled leaves', () => {
      const conflict = findOverlappingLeave(
        [
          {
            id: '1',
            startDate: parseDateOnly('2026-08-02'),
            endDate: parseDateOnly('2026-08-02'),
            status: 'REJECTED',
          },
          {
            id: '2',
            startDate: parseDateOnly('2026-08-02'),
            endDate: parseDateOnly('2026-08-02'),
            status: 'CANCELLED',
          },
        ],
        range,
      );
      expect(conflict).toBeNull();
    });

    it('ignores revoked leaves so balance is restored for new requests', () => {
      const conflict = findOverlappingLeave(
        [
          {
            id: 'revoked',
            startDate: parseDateOnly('2026-08-02'),
            endDate: parseDateOnly('2026-08-02'),
            status: 'REVOKED',
          },
        ],
        range,
      );
      expect(conflict).toBeNull();
    });

    it('finds pending overlap and respects excludeId', () => {
      const rows = [
        {
          id: 'keep',
          startDate: parseDateOnly('2026-08-02'),
          endDate: parseDateOnly('2026-08-02'),
          status: 'PENDING',
        },
      ];
      expect(findOverlappingLeave(rows, range, 'keep')).toBeNull();
      expect(findOverlappingLeave(rows, range)?.id).toBe('keep');
    });
  });

  describe('isLeaveRangeCompleted', () => {
    it('returns true when end date is before reference today', () => {
      expect(isLeaveRangeCompleted('2026-06-07', '2026-06-08')).toBe(true);
    });

    it('returns false when end date is today or later', () => {
      expect(isLeaveRangeCompleted('2026-06-08', '2026-06-08')).toBe(false);
      expect(isLeaveRangeCompleted('2026-06-09', '2026-06-08')).toBe(false);
    });
  });
});
