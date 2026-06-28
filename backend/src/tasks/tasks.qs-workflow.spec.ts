import { UserRole } from '../common/constants/roles.enum';
import { TasksService } from './tasks.service';

function createService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    task: {
      findUnique: jest.fn(),
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
