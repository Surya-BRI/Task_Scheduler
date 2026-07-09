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
    signType: 'Pylon',
    revisionCode: 'R1',
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
      technicalHead: 'TH',
      teamLead: 'TL',
      subTeamLead: null,
      designers: '[]',
    },
    taskDesigners: [],
    retailDetails: [{ hoursRequired: 6 }],
    projectDetails: [],
  };

  it('maps slim task rows for scheduler clients', () => {
    const mapped = mapSchedulerTaskSummary(baseTask);
    expect(mapped).toMatchObject({
      id: 'task-1',
      opNo: 'OP-1',
      status: 'DESIGN_NEW',
      estimatedHours: 6,
      hasTaskDesigners: false,
      project: expect.objectContaining({ projectNo: 'P-100' }),
    });
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
        { status: { notIn: ['DESIGN_COMPLETED', 'CLIENT_ACCEPTED'] } },
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
