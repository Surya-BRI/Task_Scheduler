import {
  allocateLoggedHoursFifo,
  collectDesignerTaskSlices,
  countOtherActiveSlices,
} from './task-time-allocation';

describe('task-time-allocation', () => {
  const schedules = {
    alex: {
      '0': ['mon-part'],
      '1': ['tue-part'],
    },
  };
  const tasks = {
    'mon-part': { id: 'mon-part', parentId: 'task-1', estimatedHours: 2 },
    'tue-part': { id: 'tue-part', parentId: 'task-1', estimatedHours: 1 },
  };

  it('allocates logged hours FIFO — Mon before Tue', () => {
    const slices = collectDesignerTaskSlices(schedules, tasks, 'alex', 'task-1');
    const alloc = allocateLoggedHoursFifo(slices, 1.33);
    expect(alloc.get('mon-part')).toBe(1.33);
    expect(alloc.get('tue-part')).toBe(0);
  });

  it('dragging Tue slice uses zero logged allocation when work was on Mon', () => {
    const slices = collectDesignerTaskSlices(schedules, tasks, 'alex', 'task-1');
    const alloc = allocateLoggedHoursFifo(slices, 1.33);
    expect(alloc.get('tue-part')).toBe(0);
    expect(countOtherActiveSlices(slices, 'tue-part')).toBe(1);
  });

  it('does not double-count hours already credited to a locked logged-remainder slice', () => {
    // Mon was already handed off in a prior drag, leaving a locked "1.33h logged" card behind.
    // Tue is still untouched — none of the 1.33h logged total belongs to it.
    const schedulesAfterFirstHandoff = {
      alex: {
        '0': ['mon-part'],
        '1': ['tue-part'],
      },
    };
    const tasksAfterFirstHandoff = {
      'mon-part': { id: 'mon-part', parentId: 'task-1', estimatedHours: 1.33, isLoggedRemainder: true },
      'tue-part': { id: 'tue-part', parentId: 'task-1', estimatedHours: 1 },
    };
    const slices = collectDesignerTaskSlices(schedulesAfterFirstHandoff, tasksAfterFirstHandoff, 'alex', 'task-1');
    const alloc = allocateLoggedHoursFifo(slices, 1.33);
    expect(alloc.get('mon-part')).toBe(1.33);
    expect(alloc.get('tue-part')).toBe(0);
  });
});
