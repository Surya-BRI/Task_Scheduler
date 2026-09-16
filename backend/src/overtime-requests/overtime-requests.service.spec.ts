import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TaskFilesService } from '../tasks/task-files.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { OvertimeRequestsService } from './overtime-requests.service';
import { UserRole } from '../common/constants/roles.enum';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { UpdateOvertimeRequestDto } from './dto/update-overtime-request.dto';
import { ReviewOvertimeRequestDto } from './dto/review-overtime-request.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { utcDateOnlyString } from '../common/utils/date-window.util';

const todayOtDate = () => utcDateOnlyString();

describe('OvertimeRequestsService', () => {
  let service: OvertimeRequestsService;

  const mockPrismaService: any = {
    overtimeRequest: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    leaveRequest: {
      findMany: jest.fn(),
    },
    overtimeApprovalHistory: {
      create: jest.fn(),
    },
    overtimeAttachment: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    task: {
      findUnique: jest.fn(),
    },
    schedulerAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    schedulerWeek: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: any) => any) => cb(mockPrismaService)),
    $queryRaw: jest.fn(),
  };

  const mockTaskFilesService: any = {
    uploadTaskFile: jest.fn(),
    createSignedReadUrl: jest.fn(),
    deleteObjectByKey: jest.fn(),
  };

  const mockActivityLogger = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OvertimeRequestsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TaskFilesService, useValue: mockTaskFilesService },
        { provide: ActivityLoggerService, useValue: mockActivityLogger },
      ],
    }).compile();

    service = module.get<OvertimeRequestsService>(OvertimeRequestsService);
    jest.clearAllMocks();
    mockPrismaService.task.findUnique.mockResolvedValue({
      id: 't1',
      assigneeId: '4001',
      title: 'Task 1',
      taskNo: 'T-001',
      opNo: 'OP-100',
      project: { name: 'Retail Revamp', projectNo: 'PRJ-01' },
    });
    mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);
    mockPrismaService.leaveRequest.findMany.mockResolvedValue([]);
    mockPrismaService.schedulerAssignment.findFirst.mockResolvedValue({ id: 'sa1' });
    mockPrismaService.schedulerAssignment.findMany.mockResolvedValue([]);
    mockPrismaService.$queryRaw.mockResolvedValue([
      { userId: BigInt('4003'), userName: 'HOD 1', roleName: 'Design HOD' },
    ]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listTaskOptions', () => {
    const designerId = '4010';
    const taskId = '22222222-2222-2222-2222-222222222222';

    it('returns scheduler-backed task options for the selected date', async () => {
      mockPrismaService.schedulerAssignment.findMany.mockResolvedValue([
        {
          id: 'sa1',
          task: {
            id: taskId,
            title: 'Scheduled Task',
            taskNo: 'T-001',
            opNo: 'OP-1',
            projectId: '33333333-3333-3333-3333-333333333333',
            project: {
              id: '33333333-3333-3333-3333-333333333333',
              name: 'Retail Revamp',
              projectNo: 'PRJ-01',
            },
          },
        },
      ]);

      const result = await service.listTaskOptions(designerId, '2026-06-26');

      expect(result).toEqual([
        {
          id: taskId,
          projectId: '33333333-3333-3333-3333-333333333333',
          projectName: 'Retail Revamp',
          label: 'Scheduled Task (T-001)',
        },
      ]);
      expect(mockPrismaService.schedulerAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            designerId: BigInt(designerId),
            dayIndex: 4,
          }),
        }),
      );
    });

    it('de-duplicates split scheduler rows for the same task', async () => {
      const task = {
        id: taskId,
        title: 'Split Task',
        taskNo: 'T-002',
        opNo: null,
        projectId: '33333333-3333-3333-3333-333333333333',
        project: { id: '33333333-3333-3333-3333-333333333333', name: 'Project', projectNo: null },
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

  // ────────────────────────────────────────────────────────────────────────
  // CREATE
  // ────────────────────────────────────────────────────────────────────────
  describe('create', () => {
    const baseDto: CreateOvertimeRequestDto = {
      designerId: '4001',
      taskId: 't1',
      date: todayOtDate(),
      startTime: '17:00',
      endTime: '19:00',
      requestedHours: '2.0',
      reason: 'Deadline work',
    };

    it('should throw BadRequestException if end time <= start time', async () => {
      const dto = { ...baseDto, startTime: '17:00', endTime: '16:00' };
      await expect(service.create('4001', UserRole.DESIGNER, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if end time equals start time', async () => {
      const dto = { ...baseDto, startTime: '17:00', endTime: '17:00' };
      await expect(service.create('4001', UserRole.DESIGNER, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if daily limit (8 hours) is exceeded', async () => {
      const dto = { ...baseDto, startTime: '08:00', endTime: '17:00', requestedHours: '9.0' };
      await expect(service.create('4001', UserRole.DESIGNER, dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if user tries to create request for another user without HOD/Admin role', async () => {
      const dto = { ...baseDto, designerId: '4002' };
      await expect(service.create('4001', UserRole.DESIGNER, dto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if task is not scheduled for the designer on the request date', async () => {
      mockPrismaService.schedulerAssignment.findFirst.mockResolvedValue(null);

      await expect(service.create('4001', UserRole.DESIGNER, baseDto)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.overtimeRequest.create).not.toHaveBeenCalled();
    });

    it('should allow HOD to create request on behalf of another user', async () => {
      const dto = { ...baseDto, designerId: '4002' };

      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);

      const mockResult = {
        id: 'r1',
        designerId: '4002',
        taskId: 't1',
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        startTime: '17:00',
        endTime: '19:00',
        totalHours: new Decimal(2.0),
        status: 'DRAFT',
        designer: { id: '4002', fullName: 'Designer 2', email: 'd2@x.com', departmentId: 'dept1' },
        task: { id: 't1', title: 'Task 1', taskNo: 'T-001' },
        attachments: [],
      };
      mockPrismaService.overtimeRequest.create.mockResolvedValue(mockResult);

      const result = await service.create('4004', UserRole.HOD, dto);
      expect(result.designerId).toBe('4002');
    });

    it('should auto-approve HOD self-overtime', async () => {
      const dto = { ...baseDto, designerId: '4004', status: 'Pending' as const };

      mockPrismaService.task.findUnique.mockResolvedValue({
        id: 't1',
        assigneeId: '4004',
        title: 'Task 1',
        taskNo: 'T-001',
        opNo: 'OP-100',
        project: { name: 'Retail Revamp', projectNo: 'PRJ-01' },
      });
      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);
      mockPrismaService.overtimeRequest.create.mockResolvedValue({
        id: 'r1',
        designerId: '4004',
        taskId: 't1',
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        requestedHours: new Decimal(2.0),
        totalHours: new Decimal(2.0),
        status: 'APPROVED',
        designer: { id: '4004', fullName: 'HOD User', departmentId: 'dept1' },
        task: {
          id: 't1',
          title: 'Task 1',
          taskNo: 'T-001',
          opNo: 'OP-100',
          project: { name: 'Retail Revamp', projectNo: 'PRJ-01' },
        },
        attachments: [],
      });
      mockPrismaService.user.findMany.mockResolvedValue([{ id: '4005' }]);

      const result = await service.create('4004', UserRole.HOD, dto);

      expect(result.status).toBe('APPROVED');
      expect(mockPrismaService.overtimeRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            designerId: BigInt('4004'),
            status: 'APPROVED',
            approvedById: BigInt('4004'),
            managerComments: 'Auto-approved by system (HOD submission)',
          }),
        }),
      );
      expect(mockActivityLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OVERTIME_AUTO_APPROVED',
          userId: '4004',
          taskId: 't1',
        }),
      );
      expect(mockPrismaService.notification.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on duplicate task+date', async () => {
      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue({ id: 'existing' });
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);

      await expect(service.create('4001', UserRole.DESIGNER, baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException on overlapping time range', async () => {
      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue(null);
      // Return an existing approved request with overlapping time
      mockPrismaService.overtimeRequest.findMany
        .mockResolvedValueOnce([
          { id: 'other', startTime: '18:00', endTime: '20:00', status: 'SUBMITTED' },
        ]) // overlap check
        .mockResolvedValueOnce([]); // weekly check

      await expect(service.create('4001', UserRole.DESIGNER, baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject overtime on approved full-day leave', async () => {
      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-1',
          type: 'Full Day',
          startDate: new Date(`${todayOtDate()}T00:00:00.000Z`),
          endDate: new Date(`${todayOtDate()}T00:00:00.000Z`),
        },
      ]);

      await expect(service.create('4001', UserRole.DESIGNER, baseDto)).rejects.toThrow(
        'Cannot allocate overtime because the designer has approved full-day or second-half leave for this date.',
      );
      expect(mockPrismaService.overtimeRequest.create).not.toHaveBeenCalled();
    });

    it('should create overtime draft request successfully', async () => {
      const dto = { ...baseDto, status: 'DRAFT' as const };

      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);

      const mockResult = {
        id: 'r1',
        designerId: '4001',
        taskId: 't1',
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        startTime: '17:00',
        endTime: '19:00',
        totalHours: new Decimal(2.0),
        status: 'DRAFT',
        designer: { id: '4001', fullName: 'Designer 1', email: 'd1@x.com', departmentId: 'dept1' },
        task: { id: 't1', title: 'Task 1', taskNo: 'T-001' },
        attachments: [],
      };
      mockPrismaService.overtimeRequest.create.mockResolvedValue(mockResult);

      const result = await service.create('4001', UserRole.DESIGNER, dto);
      expect(result).toEqual(mockResult);
      expect(mockPrismaService.overtimeRequest.create).toHaveBeenCalled();
      expect(mockPrismaService.overtimeApprovalHistory.create).toHaveBeenCalled();
    });

    it('should create and auto-submit request when status is SUBMITTED', async () => {
      const dto = { ...baseDto, status: 'SUBMITTED' as const };

      mockPrismaService.task.findUnique.mockResolvedValue({
        id: 't1',
        assigneeId: '4001',
        title: 'Task 1',
        taskNo: 'T-001',
        opNo: 'OP-100',
        project: { name: 'Retail Revamp', projectNo: 'PRJ-01' },
      });
      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);

      const mockResult = {
        id: 'r1',
        designerId: '4001',
        taskId: 't1',
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        requestedHours: new Decimal(2.0),
        totalHours: new Decimal(2.0),
        status: 'SUBMITTED',
        designer: { id: '4001', fullName: 'Designer 1', departmentId: 'dept1' },
        task: {
          id: 't1',
          title: 'Task 1',
          taskNo: 'T-001',
          opNo: 'OP-100',
          project: { name: 'Retail Revamp', projectNo: 'PRJ-01' },
        },
        attachments: [],
      };
      mockPrismaService.overtimeRequest.create.mockResolvedValue(mockResult);
      mockPrismaService.user.findMany.mockResolvedValue([{ id: '4003', fullName: 'HOD 1' }]);

      const result = await service.create('4001', UserRole.DESIGNER, dto);
      expect(result.status).toBe('SUBMITTED');
      expect(mockPrismaService.notification.create).toHaveBeenCalled();
      expect(mockActivityLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OVERTIME_REQUEST_SUBMITTED',
          userId: '4001',
          taskId: 't1',
        }),
      );
    });

    it('should log team activity when frontend submits with Pending status', async () => {
      const dto = { ...baseDto, status: 'Pending' as const };

      mockPrismaService.task.findUnique.mockResolvedValue({
        id: 't1',
        assigneeId: '4001',
        title: 'Task 1',
        taskNo: 'T-001',
        opNo: 'OP-100',
        project: { name: 'Retail Revamp', projectNo: 'PRJ-01' },
      });
      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);
      mockPrismaService.overtimeRequest.create.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        taskId: 't1',
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        requestedHours: new Decimal(2.0),
        totalHours: new Decimal(2.0),
        status: 'SUBMITTED',
        designer: { id: '4001', fullName: 'Designer 1', departmentId: 'dept1' },
        task: {
          id: 't1',
          title: 'Task 1',
          taskNo: 'T-001',
          opNo: 'OP-100',
          project: { name: 'Retail Revamp', projectNo: 'PRJ-01' },
        },
        attachments: [],
      });
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.create('4001', UserRole.DESIGNER, dto);

      expect(mockActivityLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'OVERTIME_REQUEST_SUBMITTED' }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ────────────────────────────────────────────────────────────────────────
  describe('update', () => {
    it('should throw NotFoundException for non-existent request', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.update('r-missing', '4001', UserRole.DESIGNER, { reason: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if non-owner/non-admin tries to update', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'DRAFT',
        attachments: [],
      });

      await expect(
        service.update('r1', '4002', UserRole.DESIGNER, { reason: 'hack' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if request is already submitted', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'SUBMITTED',
        attachments: [],
      });

      await expect(
        service.update('r1', '4001', UserRole.DESIGNER, { reason: 'late update' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow updating a DRAFT request successfully', async () => {
      const existing = {
        id: 'r1',
        designerId: '4001',
        status: 'DRAFT',
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        startTime: '17:00',
        endTime: '19:00',
        taskId: 't1',
        totalHours: new Decimal(2),
        attachments: [],
      };
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(existing);
      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);

      const updatedResult = { ...existing, reason: 'New reason', status: 'DRAFT' };
      mockPrismaService.overtimeRequest.update.mockResolvedValue(updatedResult);

      const dto: UpdateOvertimeRequestDto = { reason: 'New reason' };
      const result = await service.update('r1', '4001', UserRole.DESIGNER, dto);
      expect(result.reason).toBe('New reason');
      expect(mockPrismaService.overtimeApprovalHistory.create).toHaveBeenCalled();
    });

    it('should allow admin to update any request', async () => {
      const existing = {
        id: 'r1',
        designerId: '4001',
        status: 'DRAFT',
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        startTime: '17:00',
        endTime: '19:00',
        taskId: 't1',
        totalHours: new Decimal(2),
        attachments: [],
      };
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(existing);
      mockPrismaService.overtimeRequest.findFirst.mockResolvedValue(null);
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);
      mockPrismaService.overtimeRequest.update.mockResolvedValue(existing);

      // HOD updating someone else's request should not throw
      await expect(
        service.update('r1', '4004', UserRole.HOD, { reason: 'HOD fix' }),
      ).resolves.toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // SUBMIT
  // ────────────────────────────────────────────────────────────────────────
  describe('submit', () => {
    it('should throw NotFoundException if request does not exist', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(null);
      await expect(service.submit('r-missing', '4001')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not the owner', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'DRAFT',
      });
      await expect(service.submit('r1', '4002')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if request is not in DRAFT status', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'SUBMITTED',
      });
      await expect(service.submit('r1', '4001')).rejects.toThrow(BadRequestException);
    });

    it('should submit draft request and notify approvers', async () => {
      const mockRequest = {
        id: 'r1',
        designerId: '4001',
        taskId: 't1',
        status: 'DRAFT',
        designer: { id: '4001', fullName: 'Designer 1', email: 'd1@x.com', departmentId: 'dept1' },
        task: { id: 't1', title: 'Task 1', taskNo: 'T-001' },
        totalHours: new Decimal(2.0),
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        attachments: [],
      };

      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrismaService.overtimeRequest.update.mockResolvedValue({ ...mockRequest, status: 'SUBMITTED' });
      mockPrismaService.user.findMany.mockResolvedValue([{ id: '4003', fullName: 'HOD 1' }]);
      mockPrismaService.schedulerAssignment.findFirst.mockResolvedValue({ id: 'assign-1' });
      mockPrismaService.leaveRequest.findMany.mockResolvedValue([]);

      const result = await service.submit('r1', '4001');
      expect(result.status).toBe('SUBMITTED');
      expect(mockPrismaService.overtimeRequest.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: 'SUBMITTED' },
        include: expect.any(Object),
      });
      expect(mockPrismaService.overtimeApprovalHistory.create).toHaveBeenCalled();
      expect(mockPrismaService.notification.create).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // WITHDRAW
  // ────────────────────────────────────────────────────────────────────────
  describe('withdraw', () => {
    it('should throw NotFoundException for missing request', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(null);
      await expect(service.withdraw('r-x', '4001')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if non-owner withdraws', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'SUBMITTED',
      });
      await expect(service.withdraw('r1', '4002')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for non-withdrawable status', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'APPROVED',
      });
      await expect(service.withdraw('r1', '4001')).rejects.toThrow(BadRequestException);
    });

    it('should withdraw a SUBMITTED request successfully', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'SUBMITTED',
      });
      mockPrismaService.overtimeRequest.update.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'WITHDRAWN',
        designer: { id: '4001', fullName: 'D1', email: 'd1@x.com' },
        task: { id: 't1', title: 'T1', taskNo: 'T-001' },
      });

      const result = await service.withdraw('r1', '4001');
      expect(result.status).toBe('WITHDRAWN');
      expect(mockPrismaService.overtimeApprovalHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'WITHDRAWN' }),
        }),
      );
    });

    it('should withdraw an APPROVED_BY_MANAGER request successfully', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'APPROVED_BY_MANAGER',
      });
      mockPrismaService.overtimeRequest.update.mockResolvedValue({
        id: 'r1',
        status: 'WITHDRAWN',
        designer: { id: '4001', fullName: 'D1', email: 'd1@x.com' },
      });

      const result = await service.withdraw('r1', '4001');
      expect(result.status).toBe('WITHDRAWN');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // DELETE
  // ────────────────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('should throw NotFoundException for missing request', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(null);
      await expect(service.delete('r-x', '4001')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if non-owner deletes', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'DRAFT',
        attachments: [],
      });
      await expect(service.delete('r1', '4002')).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if request is not DRAFT', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'SUBMITTED',
        attachments: [],
      });
      await expect(service.delete('r1', '4001')).rejects.toThrow(BadRequestException);
    });

    it('should delete draft request and clean up S3 attachments', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'DRAFT',
        attachments: [
          { id: 'a1', filePath: 's3://bucket/file1.pdf' },
          { id: 'a2', filePath: 's3://bucket/file2.pdf' },
        ],
      });
      mockTaskFilesService.deleteObjectByKey.mockResolvedValue(undefined);
      mockPrismaService.overtimeRequest.delete.mockResolvedValue(undefined);

      const result = await service.delete('r1', '4001');
      expect(result.success).toBe(true);
      expect(mockTaskFilesService.deleteObjectByKey).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.overtimeRequest.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });

    it('should continue deletion even if S3 cleanup fails', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        status: 'DRAFT',
        attachments: [{ id: 'a1', filePath: 's3://bucket/file1.pdf' }],
      });
      mockTaskFilesService.deleteObjectByKey.mockRejectedValue(new Error('S3 error'));
      mockPrismaService.overtimeRequest.delete.mockResolvedValue(undefined);

      const result = await service.delete('r1', '4001');
      expect(result.success).toBe(true);
      expect(mockPrismaService.overtimeRequest.delete).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // FIND ONE
  // ────────────────────────────────────────────────────────────────────────
  describe('findOne', () => {
    it('should throw NotFoundException for non-existent request', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(null);
      await expect(service.findOne('r-x', '4001', UserRole.DESIGNER)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for non-owner non-admin designer', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        designer: { departmentId: 'dept1' },
        attachments: [],
        history: [],
      });
      await expect(service.findOne('r1', '4002', UserRole.DESIGNER)).rejects.toThrow(ForbiddenException);
    });

    // Department-scoped HOD access no longer applies: ERP has no department
    // concept on ErpAuthUsers, so any HOD may view any overtime request
    // regardless of the designer's department (see overtime-requests.service.ts
    // around line 1047).
    it('should allow HOD from a different department to view the request', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        designer: { departmentId: 'dept1' },
        attachments: [],
        history: [],
      });

      await expect(service.findOne('r1', '4005', UserRole.HOD)).resolves.toBeDefined();
    });

    it('should allow owner to view their own request with signed attachment URLs', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        designer: { departmentId: 'dept1' },
        attachments: [
          { id: 'a1', fileName: 'proof.pdf', filePath: 's3://key', sizeBytes: BigInt(1024) },
        ],
        history: [],
      });
      mockTaskFilesService.createSignedReadUrl.mockResolvedValue('https://signed-url');

      const result = await service.findOne('r1', '4001', UserRole.DESIGNER);
      expect(result.attachments[0].url).toBe('https://signed-url');
      expect(result.attachments[0].sizeBytes).toBe(1024);
    });

    it('should allow HOD to view team request', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
        designer: { departmentId: 'dept1' },
        attachments: [],
        history: [],
      });
      mockPrismaService.user.findUnique.mockResolvedValue({ departmentId: 'dept1' });

      const result = await service.findOne('r1', '4004', UserRole.HOD);
      expect(result).toBeDefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // FIND OWN REQUESTS
  // ────────────────────────────────────────────────────────────────────────
  describe('findOwnRequests', () => {
    it('should return filtered list of own requests', async () => {
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([
        { id: 'r1', status: 'DRAFT' },
        { id: 'r2', status: 'DRAFT' },
      ]);

      const result = await service.findOwnRequests('4001', { status: 'DRAFT' });
      expect(result).toHaveLength(2);
      expect(mockPrismaService.overtimeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ designerId: BigInt('4001'), status: 'DRAFT' }),
        }),
      );
    });

    it('should apply date range filters', async () => {
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);

      await service.findOwnRequests('4001', {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });

      expect(mockPrismaService.overtimeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: {
              gte: new Date('2026-06-01'),
              lte: new Date('2026-06-30'),
            },
          }),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // REVIEW (Manager & HR)
  // ────────────────────────────────────────────────────────────────────────
  describe('review', () => {
    it('should throw NotFoundException for missing request', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.review('r-x', '4003', UserRole.HOD, { status: 'APPROVED_BY_MANAGER', comments: 'ok' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if rejecting without comment', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'SUBMITTED',
        designer: { id: '4001', fullName: 'D1', departmentId: 'dept1' },
      });

      const reviewDto: ReviewOvertimeRequestDto = {
        status: 'REJECTED_BY_MANAGER',
        comments: '',
      };

      await expect(
        service.review('r1', '4003', UserRole.HOD, reviewDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if rejecting with whitespace-only comment', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'SUBMITTED',
        designer: { id: '4001', fullName: 'D1', departmentId: 'dept1' },
      });

      await expect(
        service.review('r1', '4003', UserRole.HOD, { status: 'REJECTED_BY_MANAGER', comments: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException if DESIGNER tries to do manager review', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'SUBMITTED',
        designer: { id: '4001', fullName: 'D1', departmentId: 'dept1' },
      });

      await expect(
        service.review('r1', '4002', UserRole.DESIGNER, { status: 'APPROVED_BY_MANAGER', comments: 'ok' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if request is not SUBMITTED for manager review', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'DRAFT',
        designer: { id: '4001', fullName: 'D1', departmentId: 'dept1' },
      });

      await expect(
        service.review('r1', '4003', UserRole.HOD, { status: 'APPROVED_BY_MANAGER', comments: 'ok' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow HOD to approve submitted request', async () => {
      const mockRequest = {
        id: 'r1',
        status: 'SUBMITTED',
        designerId: '4001',
        totalHours: new Decimal(2.0),
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        designer: { id: '4001', fullName: 'Designer 1', departmentId: 'dept1' },
      };
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrismaService.overtimeRequest.update.mockResolvedValue({
        ...mockRequest,
        status: 'APPROVED',
        designerId: '4001',
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        designer: { id: '4001', fullName: 'Designer 1', email: 'd1@x.com' },
      });

      const reviewDto: ReviewOvertimeRequestDto = {
        status: 'APPROVED_BY_MANAGER',
        comments: 'Looks good',
      };

      const result = await service.review('r1', '4003', UserRole.HOD, reviewDto);
      expect(result.status).toBe('APPROVED');
      expect(mockPrismaService.overtimeRequest.update).toHaveBeenCalled();
      expect(mockPrismaService.overtimeApprovalHistory.create).toHaveBeenCalled();
      expect(mockPrismaService.notification.create).toHaveBeenCalled();
      expect(mockPrismaService.schedulerWeek.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            version: { increment: 1 },
            updatedBy: BigInt('4003'),
            lastPayloadHash: null,
          }),
        }),
      );
    });

    it('should reject approval when designer has approved full-day leave', async () => {
      const mockRequest = {
        id: 'r1',
        status: 'SUBMITTED',
        designerId: '4001',
        totalHours: new Decimal(2.0),
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        designer: { id: '4001', fullName: 'Designer 1', departmentId: 'dept1' },
      };
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrismaService.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'leave-1',
          type: 'Full Day',
          startDate: new Date(`${todayOtDate()}T00:00:00.000Z`),
          endDate: new Date(`${todayOtDate()}T00:00:00.000Z`),
        },
      ]);

      await expect(
        service.review('r1', '4003', UserRole.HOD, {
          status: 'APPROVED_BY_MANAGER',
          comments: 'Looks good',
        }),
      ).rejects.toThrow(
        'Cannot allocate overtime because the designer has approved full-day or second-half leave for this date.',
      );
      expect(mockPrismaService.overtimeRequest.update).not.toHaveBeenCalled();
    });

    it('should allow HOD to reject submitted request', async () => {
      const mockRequest = {
        id: 'r1',
        status: 'SUBMITTED',
        designerId: '4001',
        totalHours: new Decimal(2.0),
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        designer: { id: '4001', fullName: 'Designer 1', departmentId: 'dept1' },
      };
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(mockRequest);
      mockPrismaService.overtimeRequest.update.mockResolvedValue({
        ...mockRequest,
        status: 'REJECTED_BY_MANAGER',
        designerId: '4001',
        date: new Date(`${todayOtDate()}T00:00:00.000Z`),
        designer: { id: '4001', fullName: 'Designer 1', email: 'd1@x.com' },
      });

      const result = await service.review('r1', '4003', UserRole.HOD, {
        status: 'REJECTED_BY_MANAGER',
        comments: 'Not justified',
      });
      expect(result.status).toBe('REJECTED_BY_MANAGER');
    });

    it('should throw BadRequestException for invalid review status action', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'SUBMITTED',
        designer: { id: '4001', fullName: 'D1', departmentId: 'dept1' },
      });

      await expect(
        service.review('r1', '4003', UserRole.HOD, { status: 'INVALID_STATUS' as any, comments: 'ok' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // FIND PENDING APPROVALS
  // ────────────────────────────────────────────────────────────────────────
  describe('findPendingApprovals', () => {
    // Department-scoped HOD filtering no longer applies: ERP has no department
    // concept on ErpAuthUsers, so every HOD sees all pending requests
    // company-wide (see overtime-requests.service.ts around line 1209).
    it('should not filter by department for HOD role (no department concept on ERP users)', async () => {
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);

      await service.findPendingApprovals('4004', UserRole.HOD);
      expect(mockPrismaService.overtimeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'SUBMITTED',
          }),
        }),
      );
      const callArgs = mockPrismaService.overtimeRequest.findMany.mock.calls[0][0];
      expect(callArgs.where.designer).toBeUndefined();
    });

    it('should return submitted requests for HOD without department filter', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ departmentId: null });
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

      const result = await service.findPendingApprovals('4004', UserRole.HOD);
      expect(result).toHaveLength(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // FIND ALL REQUESTS (HR/Admin)
  // ────────────────────────────────────────────────────────────────────────
  describe('findAllRequests', () => {
    it('should return paginated results with total count', async () => {
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([{ id: 'r1' }]);
      mockPrismaService.overtimeRequest.count.mockResolvedValue(1);

      const result = await service.findAllRequests({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
      expect(result.totalPages).toBe(1);
    });

    it('should apply search filter across reason, designer name, and task title', async () => {
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);
      mockPrismaService.overtimeRequest.count.mockResolvedValue(0);

      await service.findAllRequests({ search: 'urgent' });
      expect(mockPrismaService.overtimeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { reason: { contains: 'urgent' } },
              { designer: { userName: { contains: 'urgent' } } },
              { task: { title: { contains: 'urgent' } } },
            ]),
          }),
        }),
      );
    });

    it('should apply status and designerId filters', async () => {
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([]);
      mockPrismaService.overtimeRequest.count.mockResolvedValue(0);

      await service.findAllRequests({ status: 'APPROVED', designerId: '4001' });
      expect(mockPrismaService.overtimeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'APPROVED', designerId: BigInt('4001') }),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // UPLOAD ATTACHMENT
  // ────────────────────────────────────────────────────────────────────────
  describe('uploadAttachment', () => {
    it('should throw NotFoundException for non-existent request', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue(null);
      await expect(
        service.uploadAttachment('r-x', {} as any, '4001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if non-owner uploads', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
      });
      await expect(
        service.uploadAttachment('r1', {} as any, '4002'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should upload attachment and create record', async () => {
      mockPrismaService.overtimeRequest.findUnique.mockResolvedValue({
        id: 'r1',
        designerId: '4001',
      });
      mockTaskFilesService.uploadTaskFile.mockResolvedValue({
        fileName: 'proof.pdf',
        key: 's3://bucket/proof.pdf',
        mimeType: 'application/pdf',
        size: 2048,
      });
      const mockAttachment = {
        id: 'a1',
        overtimeRequestId: 'r1',
        fileName: 'proof.pdf',
        filePath: 's3://bucket/proof.pdf',
      };
      mockPrismaService.overtimeAttachment.create.mockResolvedValue(mockAttachment);

      const file = { originalname: 'proof.pdf', size: 2048 } as Express.Multer.File;
      const result = await service.uploadAttachment('r1', file, '4001');
      expect(result).toEqual(mockAttachment);
      expect(mockTaskFilesService.uploadTaskFile).toHaveBeenCalledWith(file, '4001');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // STATISTICS
  // ────────────────────────────────────────────────────────────────────────
  describe('getStatistics', () => {
    it('should compute statistics from all overtime requests', async () => {
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([
        { status: 'SUBMITTED', totalHours: new Decimal(2), approvedHours: null },
        { status: 'APPROVED_BY_MANAGER', totalHours: new Decimal(3), approvedHours: new Decimal(3) },
        { status: 'APPROVED', totalHours: new Decimal(4), approvedHours: new Decimal(4) },
        { status: 'APPROVED', totalHours: new Decimal(1), approvedHours: new Decimal(1) },
        { status: 'REJECTED_BY_MANAGER', totalHours: new Decimal(2), approvedHours: null },
        { status: 'DRAFT', totalHours: new Decimal(1), approvedHours: null },
        { status: 'WITHDRAWN', totalHours: new Decimal(1), approvedHours: null },
      ]);

      const stats = await service.getStatistics();
      expect(stats.totalRequests).toBe(7);
      expect(stats.pendingApproval).toBe(2); // SUBMITTED + APPROVED_BY_MANAGER
      expect(stats.fullyApproved).toBe(2);
      expect(stats.rejected).toBe(1);
      expect(stats.totalApprovedHours).toBe(5); // 4 + 1
      expect(stats.totalRequestedHours).toBe(12); // excludes DRAFT and WITHDRAWN => 2+3+4+1+2 = 12
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // EXPORT REPORT
  // ────────────────────────────────────────────────────────────────────────
  describe('exportReport', () => {
    it('should export all requests when no status filter is provided', async () => {
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

      const result = await service.exportReport();
      expect(result).toHaveLength(2);
      expect(mockPrismaService.overtimeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('should export filtered requests by status', async () => {
      mockPrismaService.overtimeRequest.findMany.mockResolvedValue([{ id: 'r1' }]);

      const result = await service.exportReport('APPROVED');
      expect(result).toHaveLength(1);
      expect(mockPrismaService.overtimeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'APPROVED' } }),
      );
    });
  });
});
