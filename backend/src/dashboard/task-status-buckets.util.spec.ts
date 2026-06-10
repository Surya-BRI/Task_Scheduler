import {
  aggregateStatusCounts,
  categorizeTaskStatus,
  ALL_KNOWN_TASK_STATUSES,
} from './task-status-buckets.util';

describe('task-status-buckets.util', () => {
  it('maps every known status to a bucket', () => {
    for (const status of ALL_KNOWN_TASK_STATUSES) {
      expect(['active', 'onHold', 'completed']).toContain(categorizeTaskStatus(status));
    }
  });

  it('aggregates counts so total equals sum of buckets', () => {
    const counts = {
      PENDING: 5,
      DESIGN_NEW: 17,
      ON_HOLD: 1,
      COMPLETED: 2,
    };
    const buckets = aggregateStatusCounts(counts);
    expect(buckets.total).toBe(25);
    expect(buckets.active).toBe(22);
    expect(buckets.onHold).toBe(1);
    expect(buckets.completed).toBe(2);
  });

  it('treats unknown statuses as active', () => {
    const buckets = aggregateStatusCounts({ FUTURE_STATUS: 3 });
    expect(buckets.active).toBe(3);
    expect(buckets.total).toBe(3);
    expect(buckets.unknown).toBe(3);
  });
});
