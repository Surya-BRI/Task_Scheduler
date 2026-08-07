import {
  computeSchedulerEstimatedHours,
  mapSchedulerTaskSummary,
  schedulerQueueWhere,
} from './scheduler-task-summary.util';

describe('scheduler-task-summary.util', () => {
  const baseTask = {
    id: 'task-1',
    opNo: 'OP-1',
    title: 'Sign design',
    designType: 'Project',
    disciplineType: 'Artwork',
    status: 'DESIGN_NEW',
    priority: 'HIGH',
    assigneeId: null,
    holdPreviousStatus: null,
    projectId: 'proj-1',
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    project: {
      id: 'proj-1',
      name: 'Retail rollout',
      projectNo: 'P-100',
      category: 'Retail',
    },
    taskDesigners: [],
    retailDetails: [{ hoursRequired: 6 }],
    projectDetails: [],
  };

  it('maps slim task rows for scheduler clients without null stub fields', () => {
    const mapped = mapSchedulerTaskSummary(baseTask);
    expect(mapped).toMatchObject({
      id: 'task-1',
      opNo: 'OP-1',
      status: 'DESIGN_NEW',
      estimatedHours: 6,
      hasTaskDesigners: false,
      project: expect.objectContaining({
        projectNo: 'P-100',
        category: 'Retail',
      }),
    });
    expect(mapped).not.toHaveProperty('signType');
    expect(mapped).not.toHaveProperty('revisionCode');
    expect(mapped).not.toHaveProperty('phase');
    expect(mapped.project).not.toHaveProperty('technicalHead');
    expect(mapped.project).not.toHaveProperty('teamLead');
  });

  it('computes estimated hours from project detail lines when retail hours are absent', () => {
    const hours = computeSchedulerEstimatedHours({
      ...baseTask,
      retailDetails: [],
      projectDetails: [
        { artworkHours: 2, technicalHours: 1, locationHours: 0, asBuiltHours: 0 },
      ],
    });
    expect(hours).toBe(3);
  });

  it('builds a queue filter for unassigned and on-hold tasks only', () => {
    expect(schedulerQueueWhere()).toEqual({
      AND: [
        { status: { notIn: ['CLIENT_ACCEPTED', 'CLIENT_REJECTED'] } },
        {
          OR: [
            { status: 'ON_HOLD' },
            {
              AND: [{ assigneeId: null }, { taskDesigners: { none: {} } }],
            },
          ],
        },
      ],
    });
  });
});
