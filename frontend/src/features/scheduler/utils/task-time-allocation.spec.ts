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
});
