import { UserRole } from '../common/constants/roles.enum';
import { TasksService } from './tasks.service';

function createService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    task: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    projectSignRow: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...prismaOverrides,
  } as any;
  const service = new TasksService(
    prisma,
    {} as any,
    { log: jest.fn().mockResolvedValue(undefined) } as any,
    { create: jest.fn().mockResolvedValue(undefined) } as any,
  );
  return { service, prisma };
}



describe('TasksService designer involvement and transaction status filters', () => {
  it('scopes designer lists to assignee, junction, scheduler, and work-session involvement', async () => {
    const { service, prisma } = createService();
    const designerId = '22222222-2222-4222-8222-222222222222';

    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);

    await service.findAll(designerId, UserRole.DESIGNER, { limit: 100 });

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { assigneeId: designerId },
                { taskDesigners: { some: { designerId } } },
                { schedulerAssignments: { some: { designerId } } },
                { workSessions: { some: { designerId } } },
              ],
            },
          ]),
        }),
      }),
    );
  });

  it('filters transaction views with a statuses list', async () => {
    const { service, prisma } = createService();
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);

    await service.findAll('hod-1', UserRole.HOD, {
      statuses: 'DESIGN_NEW,IN_PROGRESS,DESIGN_COMPLETED',
      limit: 100,
    });

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { status: { in: ['DESIGN_NEW', 'IN_PROGRESS', 'DESIGN_COMPLETED'] } },
          ]),
        }),
      }),
    );
  });

  it('filters Design Completed transaction view to DESIGN_COMPLETED only', async () => {
    const { service, prisma } = createService();
    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);

    await service.findAll('hod-1', UserRole.HOD, {
      statuses: 'DESIGN_COMPLETED',
      limit: 100,
    });

    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'DESIGN_COMPLETED',
        }),
      }),
    );
  });

  it('blocks designers from reading another designer task by id', async () => {
    const { service, prisma } = createService();
    prisma.task.findUnique.mockResolvedValue({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      assigneeId: 'other-designer',
    });
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(
        'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        '22222222-2222-4222-8222-222222222222',
        UserRole.DESIGNER,
        { view: 'core' },
      ),
    ).rejects.toThrow('Designers can only access tasks they have worked on or been assigned to');
  });
});

describe('TasksService findAll assignment filtering', () => {
  it('includes direct and split task designer assignments for assignee filters', async () => {
    const { service, prisma } = createService();
    const assigneeId = '11111111-1111-4111-8111-111111111111';

    prisma.task.findMany.mockResolvedValue([]);
    prisma.task.count.mockResolvedValue(0);

    await service.findAll('33333333-3333-4333-8333-333333333333', UserRole.HOD, {
      assigneeId,
      limit: 200,
    });

    const expectedAssigneeFilter = {
      OR: [
        { assigneeId },
        { taskDesigners: { some: { designerId: assigneeId } } },
      ],
    };
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([expectedAssigneeFilter]),
        }),
      }),
    );
    expect(prisma.task.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([expectedAssigneeFilter]),
        }),
      }),
    );
  });
});
