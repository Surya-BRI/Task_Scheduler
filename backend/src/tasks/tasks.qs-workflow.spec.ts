import { BadRequestException } from '@nestjs/common';
import { TasksService } from './tasks.service';

function createService(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
    task: { findUnique: jest.fn() },
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

const completeRow = {
  tNo: 'T1',
  no: '1',
  signType: 'Wayfinding',
  planCode: 'P-001',
  estQty: 1,
  qsQty: 1,
  areaZone: 'Zone A',
  levelParcel: 'L1',
  sequence: 'A',
  status: 'UPDATED',
  contRef: 'CON-001',
};

describe('TasksService QS workflow', () => {
  it('validates required sign row fields before persistence', () => {
    const { service } = createService();

    expect(() => (service as any).normalizeSignRows({ rows: [completeRow] })).not.toThrow();
    expect(() => (service as any).normalizeSignRows({
      rows: [{ ...completeRow, signType: '' }],
    })).toThrow(BadRequestException);
  });

  it('defaults missing persisted QS status to Pending', async () => {
    const { service, prisma } = createService();
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect((service as any).getProjectQsStatus('11111111-1111-4111-8111-111111111111'))
      .resolves.toMatchObject({ status: 'Pending' });
  });

  it('reads persisted In Progress QS status', async () => {
    const { service, prisma } = createService();
    prisma.$queryRaw.mockResolvedValueOnce([{ projectId: 'p1', status: 'In Progress' }]);

    await expect((service as any).getProjectQsStatus('11111111-1111-4111-8111-111111111111'))
      .resolves.toMatchObject({ status: 'In Progress' });
  });

  it('blocks sign row edits when QS status is Completed', async () => {
    const { service, prisma } = createService();
    prisma.task.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      taskNo: 'TSK-QS',
      title: 'QS Task',
      projectId: '11111111-1111-4111-8111-111111111111',
      project: { id: '11111111-1111-4111-8111-111111111111', projectNo: 'P-1', name: 'Project' },
    });
    prisma.$queryRaw.mockResolvedValueOnce([{ projectId: '11111111-1111-4111-8111-111111111111', status: 'Completed' }]);

    await expect(service.saveSignRows(
      '22222222-2222-4222-8222-222222222222',
      { rows: [completeRow] },
      '33333333-3333-4333-8333-333333333333',
      'HOD' as any,
    )).rejects.toThrow(BadRequestException);
  });
});
