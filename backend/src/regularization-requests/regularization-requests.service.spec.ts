import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { UserRole } from '../common/constants/roles.enum';
import { RegularizationRequestsService } from './regularization-requests.service';
import { CreateRegularizationRequestDto } from './dto/create-regularization-request.dto';

const todayRegDate = () => new Date().toISOString().split('T')[0];

describe('RegularizationRequestsService', () => {
  let service: RegularizationRequestsService;

  const designerId = '11111111-1111-1111-1111-111111111111';
  const taskId = '22222222-2222-2222-2222-222222222222';
  const hodId = '33333333-3333-3333-3333-333333333333';

  const mockPrismaService: any = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    task: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    schedulerAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    regularizationRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    schedulerWeek: {
      upsert: jest.fn(),
    },
  };

  const mockActivityLogger = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegularizationRequestsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ActivityLoggerService, useValue: mockActivityLogger },
      ],
    }).compile();

    service = module.get<RegularizationRequestsService>(RegularizationRequestsService);
    jest.clearAllMocks();
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: designerId,
      fullName: 'Designer One',
      departmentId: 'dept1',
    });
    mockPrismaService.user.findMany.mockResolvedValue([
      { id: hodId, fullName: 'HOD One', email: 'hod@example.com' },
    ]);
    mockPrismaService.task.findUnique.mockResolvedValue({
      id: taskId,
      taskNo: 'T-001',
      title: 'Task 1',
    });
    mockPrismaService.schedulerAssignment.findFirst.mockResolvedValue({ id: 'sa1' });
    mockPrismaService.schedulerAssignment.findMany.mockResolvedValue([]);
    mockPrismaService.regularizationRequest.create.mockResolvedValue({
      id: '44444444-4444-4444-4444-444444444444',
      designerId,
      taskId,
      date: new Date(`${todayRegDate()}T00:00:00.000Z`),
      duration: '30 mins',
      reason: 'System Issue',
      notes: null,
      status: 'Pending',
      approverId: hodId,
      approverRemarks: null,
      reviewedAt: null,
      createdAt: new Date(),
      designer: {
        id: designerId,
        fullName: 'Designer One',
        departmentId: 'dept1',
        department: { name: 'Design' },
      },
      task: {
        id: taskId,
        taskNo: 'T-001',
        title: 'Task 1',
        opNo: null,
      },
      approver: { id: hodId, fullName: 'HOD One' },
    });
  });

  describe('create', () => {
    const baseDto = (): CreateRegularizationRequestDto => ({
      designerId,
      regularizationType: 'task',
      taskId,
      date: todayRegDate(),
      duration: '30 mins',
      reason: 'System Issue',
      status: 'Pending',
    });

    it('should reject task regularization when the task is not scheduled for the selected date', async () => {
      mockPrismaService.schedulerAssignment.findFirst.mockResolvedValue(null);

      await expect(service.create(designerId, UserRole.DESIGNER, baseDto())).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.regularizationRequest.create).not.toHaveBeenCalled();
    });

    it('should create task regularization when the task is scheduled for the selected date', async () => {
      const result = await service.create(designerId, UserRole.DESIGNER, baseDto());

      expect(result.taskId).toBe(taskId);
      expect(mockPrismaService.schedulerAssignment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            designerId,
            taskId,
          }),
        }),
      );
      expect(mockPrismaService.regularizationRequest.create).toHaveBeenCalled();
    });
  });

  describe('listTaskOptions', () => {
    it('returns scheduler-backed task options for the selected date', async () => {
      mockPrismaService.schedulerAssignment.findMany.mockResolvedValue([
        {
          id: 'sa1',
          task: {
            id: taskId,
            taskNo: 'T-001',
            title: 'Task 1',
            opNo: 'OP-100',
          },
        },
      ]);

      const result = await service.listTaskOptions(designerId, '2026-06-26');

      expect(result).toEqual([{ id: taskId, name: 'Task 1 (T-001)' }]);
      expect(mockPrismaService.schedulerAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            designerId,
            dayIndex: 4,
          }),
        }),
      );
    });

    it('de-duplicates split scheduler rows for the same task', async () => {
      const task = {
        id: taskId,
        taskNo: 'T-001',
        title: 'Task 1',
        opNo: 'OP-100',
      };
      mockPrismaService.schedulerAssignment.findMany.mockResolvedValue([
        { id: 'sa1', task },
        { id: 'sa2', task },
      ]);

      const result = await service.listTaskOptions(designerId, '2026-06-26');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(taskId);
    });

    it('rejects invalid option input', async () => {
      await expect(service.listTaskOptions('not-a-uuid', '2026-06-26')).rejects.toThrow(BadRequestException);
      await expect(service.listTaskOptions(designerId, '26-06-2026')).rejects.toThrow(BadRequestException);
    });
  });
});
