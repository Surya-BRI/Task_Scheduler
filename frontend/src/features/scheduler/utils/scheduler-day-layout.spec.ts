import { describe, expect, it } from 'vitest';
import {
  isRequestSystemBlock,
  partitionDayTaskIds,
  shouldSkipOptimizerTask,
} from './scheduler-day-layout';

const firstHalfLeave = {
  id: 'leave-first',
  isSystemBlock: true,
  requestType: 'LEAVE',
  leaveSession: 'First Half',
  estimatedHours: 4,
  scheduledHours: 4,
};

const secondHalfLeave = {
  id: 'leave-second',
  isSystemBlock: true,
  requestType: 'LEAVE',
  leaveSession: 'Second Half',
  estimatedHours: 4,
  scheduledHours: 4,
};

const taskA = {
  id: 'task-a',
  estimatedHours: 4,
  scheduledHours: 4,
};

const taskB = {
  id: 'task-b',
  estimatedHours: 4,
  scheduledHours: 4,
};

describe('scheduler-day-layout', () => {
  it('treats approved leave as a system block', () => {
    expect(isRequestSystemBlock(firstHalfLeave)).toBe(true);
    expect(shouldSkipOptimizerTask(firstHalfLeave)).toBe(true);
  });

  it('keeps leave on the system strip and tasks on the work row', () => {
    const taskMap = {
      [taskA.id]: taskA,
      [firstHalfLeave.id]: firstHalfLeave,
    };
    const layout = partitionDayTaskIds([taskA.id, firstHalfLeave.id], taskMap);

    expect(layout.systemBlockIds).toEqual([firstHalfLeave.id]);
    expect(layout.visualRegularTaskIds).toEqual([taskA.id]);
    expect(layout.overtimeTaskIds).toEqual([]);
  });

  it('orders first-half leave before second-half leave on the system strip', () => {
    const taskMap = {
      [taskA.id]: taskA,
      [firstHalfLeave.id]: firstHalfLeave,
      [secondHalfLeave.id]: secondHalfLeave,
    };
    const layout = partitionDayTaskIds([secondHalfLeave.id, taskA.id, firstHalfLeave.id], taskMap);

    expect(layout.systemBlockIds).toEqual([firstHalfLeave.id, secondHalfLeave.id]);
    // 4h + 4h leave already fills the day — work spills to overtime.
    expect(layout.visualRegularTaskIds).toEqual([]);
    expect(layout.overtimeTaskIds).toEqual([taskA.id]);
  });

  it('overflows schedulable hours beyond 8h/day but keeps leave on the system strip', () => {
    const taskMap = {
      [secondHalfLeave.id]: secondHalfLeave,
      [taskA.id]: taskA,
      [taskB.id]: taskB,
    };
    const layout = partitionDayTaskIds([secondHalfLeave.id, taskA.id, taskB.id], taskMap);

    expect(layout.systemBlockIds).toEqual([secondHalfLeave.id]);
    expect(layout.visualRegularTaskIds).toEqual([taskA.id]);
    expect(layout.overtimeTaskIds).toEqual([taskB.id]);
  });

  it('does not move first-half leave into overtime when removing a sibling task frees capacity', () => {
    const taskMap = {
      [firstHalfLeave.id]: firstHalfLeave,
      [taskA.id]: taskA,
      [taskB.id]: taskB,
    };
    const before = partitionDayTaskIds([firstHalfLeave.id, taskA.id, taskB.id], taskMap);
    const after = partitionDayTaskIds([firstHalfLeave.id, taskA.id], taskMap);

    expect(before.systemBlockIds).toEqual([firstHalfLeave.id]);
    expect(before.visualRegularTaskIds).toEqual([taskA.id]);
    expect(before.overtimeTaskIds).toContain(taskB.id);
    expect(after.systemBlockIds).toEqual([firstHalfLeave.id]);
    expect(after.visualRegularTaskIds).toEqual([taskA.id]);
    expect(after.overtimeTaskIds).toEqual([]);
  });

  it('keeps second-half leave on the system strip after a sibling task is removed', () => {
    const taskMap = {
      [secondHalfLeave.id]: secondHalfLeave,
      [taskA.id]: taskA,
      [taskB.id]: taskB,
    };
    const before = partitionDayTaskIds([secondHalfLeave.id, taskA.id, taskB.id], taskMap);
    const after = partitionDayTaskIds([secondHalfLeave.id, taskA.id], taskMap);

    expect(before.systemBlockIds).toEqual([secondHalfLeave.id]);
    expect(before.visualRegularTaskIds).toEqual([taskA.id]);
    expect(after.systemBlockIds).toEqual([secondHalfLeave.id]);
    expect(after.visualRegularTaskIds).toEqual([taskA.id]);
    expect(after.overtimeTaskIds).toEqual([]);
  });
});
