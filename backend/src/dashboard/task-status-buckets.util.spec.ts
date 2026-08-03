import {
  aggregateStatusCounts,
  categorizeTaskStatus,
  isTaskReassignmentBlocked,
  ALL_KNOWN_TASK_STATUSES,
} from './task-status-buckets.util';

describe('task-status-buckets.util', () => {
  it('maps every known status to a bucket', () => {
    for (const status of ALL_KNOWN_TASK_STATUSES) {
      expect(['active', 'inReview', 'onHold', 'closed']).toContain(categorizeTaskStatus(status));
    }
  });

  it('puts DESIGN_COMPLETED in review and CLIENT_REJECTED in closed', () => {
    expect(categorizeTaskStatus('DESIGN_COMPLETED')).toBe('inReview');
    expect(categorizeTaskStatus('HOD_REVIEW')).toBe('inReview');
    expect(categorizeTaskStatus('CLIENT_REJECTED')).toBe('closed');
    expect(categorizeTaskStatus('CLIENT_ACCEPTED')).toBe('closed');
    expect(categorizeTaskStatus('REWORK')).toBe('active');
  });

  it('blocks reassignment for in-review and closed, allows active and on-hold', () => {
    expect(isTaskReassignmentBlocked('DESIGN_COMPLETED')).toBe(true);
    expect(isTaskReassignmentBlocked('HOD_REVIEW')).toBe(true);
    expect(isTaskReassignmentBlocked('SALES_REVIEW')).toBe(true);
    expect(isTaskReassignmentBlocked('CLIENT_ACCEPTED')).toBe(true);
    expect(isTaskReassignmentBlocked('CLIENT_REJECTED')).toBe(true);
    expect(isTaskReassignmentBlocked('DESIGN_PLANNED')).toBe(false);
    expect(isTaskReassignmentBlocked('IN_PROGRESS')).toBe(false);
    expect(isTaskReassignmentBlocked('REWORK')).toBe(false);
    expect(isTaskReassignmentBlocked('ON_HOLD')).toBe(false);
    expect(isTaskReassignmentBlocked('DESIGN_NEW')).toBe(false);
  });

  it('aggregates counts so total equals sum of buckets', () => {
    const counts = {
      DESIGN_NEW: 22,
      ON_HOLD: 1,
      DESIGN_COMPLETED: 2,
      CLIENT_ACCEPTED: 3,
      CLIENT_REJECTED: 1,
    };
    const buckets = aggregateStatusCounts(counts);
    expect(buckets.total).toBe(29);
    expect(buckets.active).toBe(22);
    expect(buckets.inReview).toBe(2);
    expect(buckets.onHold).toBe(1);
    expect(buckets.closed).toBe(4);
    expect(buckets.completed).toBe(4);
  });

  it('treats unknown statuses as active', () => {
    const buckets = aggregateStatusCounts({ FUTURE_STATUS: 3 });
    expect(buckets.active).toBe(3);
    expect(buckets.total).toBe(3);
    expect(buckets.unknown).toBe(3);
  });
});
