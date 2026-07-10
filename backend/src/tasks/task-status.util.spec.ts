import { normalizeTaskStatus, TASK_STATUSES } from './task-status.util';

describe('task-status.util', () => {
  it('lists only unified lifecycle statuses', () => {
    expect(TASK_STATUSES).toEqual([
      'DESIGN_NEW',
      'DESIGN_PLANNED',
      'IN_PROGRESS',
      'DESIGN_COMPLETED',
      'HOD_REVIEW',
      'SALES_REVIEW',
      'REWORK',
      'CLIENT_ACCEPTED',
      'CLIENT_REJECTED',
      'ON_HOLD',
    ]);
  });

  it('normalizes canonical values', () => {
    expect(normalizeTaskStatus('IN_PROGRESS')).toBe('IN_PROGRESS');
    expect(normalizeTaskStatus('ON-HOLD')).toBe('ON_HOLD');
  });

  it('does not preserve legacy task status codes', () => {
    expect(normalizeTaskStatus('WIP')).toBe('DESIGN_NEW');
    expect(normalizeTaskStatus('PENDING')).toBe('DESIGN_NEW');
  });
});
