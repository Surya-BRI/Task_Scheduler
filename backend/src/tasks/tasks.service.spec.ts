import { TasksService } from './tasks.service';
import { UserRole } from '../common/constants/roles.enum';

describe('TasksService', () => {
  const TASK_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const existingTask = {
    id: TASK_ID,
    status: 'IN_PROGRESS',
    assigneeId: 'designer-1',
    startedAt: new Date('2026-07-01T00:00:00.000Z'),
    holdPreviousStatus: null,
    projectId: 'project-1',
    opNo: 'OP-1',
    designType: 'PROJECT',
    signType: 'Pylon',
    signFamily: 'Family',
    disciplineType: 'Artwork',
    title: 'Facade',
    description: null,
    priority: 'MEDIUM',
    dueDate: null,
    technicalHead: null,
    teamLead: null,
    subTeamLead: null,
    designers: null,
  };

  const updatedTask = {
    id: TASK_ID,
    taskNo: 'T-100',
    opNo: 'OP-1',
    title: 'Facade',
    status: 'ON_HOLD',
    designType: 'Project',
    assigneeId: 'designer-1',
    project: { id: 'project-1', projectNo: 'P-1', name: 'Project One' },
    retailDetails: [],
    projectDetails: [],
  };

  const prisma: any = {
    task: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    taskDesigner: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    schedulerAssignment: { findMany: jest.fn(), deleteMany: jest.fn() },
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    taskWorkSession: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    project: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    projectTaskDetail: { create: jest.fn() },
    retailTaskDetail: { create: jest.fn() },
    retailTaskDetailAttachment: { create: jest.fn() },
    projectTaskDetailAttachment: { create: jest.fn() },
    chatterPost: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((cb: (tx: any) => Promise<unknown>) => cb(prisma)),
  };
  const taskFilesService: any = {};
  const activityLogger: any = { log: jest.fn() };
  const notificationsService: any = { create: jest.fn() };
  const dashboardRealtime: any = {
    notifyOverviewRefresh: jest.fn(),
    notifyUserNotificationRefresh: jest.fn(),
    notifyTimerPaused: jest.fn(),
  };

  const service = new TasksService(prisma, taskFilesService, activityLogger, notificationsService, dashboardRealtime);

  beforeEach(() => {
    jest.clearAllMocks();
    // Prefer reset for findUnique so leftover mockResolvedValueOnce queues from a
    // failed prior test cannot leak into the next case (e.g. ON_HOLD resume).
    prisma.task.findUnique.mockReset();
    prisma.task.update.mockReset();
    prisma.task.findUnique.mockResolvedValue(existingTask);
    prisma.task.update.mockResolvedValue(updatedTask);
    prisma.schedulerAssignment.findMany.mockResolvedValue([]);
    prisma.schedulerAssignment.deleteMany.mockResolvedValue({ count: 0 });
    prisma.taskDesigner.findMany.mockResolvedValue([]);
    prisma.taskDesigner.create.mockResolvedValue({});
    prisma.taskDesigner.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.findMany.mockResolvedValue([]);
    notificationsService.create.mockResolvedValue({});
    prisma.task.findMany.mockResolvedValue([]);
    prisma.chatterPost.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation((cb: (tx: any) => Promise<unknown>) => cb(prisma));
    activityLogger.log.mockResolvedValue(undefined);
  });

  describe('updateStatus — ON_HOLD scheduler-consolidation guard', () => {
    it('deletes unconditionally when no expectedAssignmentIds given (back-compat)', async () => {
      await service.updateStatus(TASK_ID, 'hod-1', UserRole.HOD, { status: 'ON_HOLD' } as any);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.schedulerAssignment.findMany).not.toHaveBeenCalled();
      expect(prisma.task.update).toHaveBeenCalled();
      expect(prisma.schedulerAssignment.deleteMany).toHaveBeenCalledWith({
        where: { taskId: TASK_ID, weekStartDate: { gte: expect.any(Date) } },
      });
    });

    it('proceeds when every live row is in expectedAssignmentIds', async () => {
      prisma.schedulerAssignment.findMany.mockResolvedValue([{ id: 'row-a' }]);

      await service.updateStatus(TASK_ID, 'hod-1', UserRole.HOD, {
        status: 'ON_HOLD',
        expectedAssignmentIds: ['row-a'],
      } as any);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.task.update).toHaveBeenCalled();
      expect(prisma.schedulerAssignment.deleteMany).toHaveBeenCalledWith({
        where: { taskId: TASK_ID, weekStartDate: { gte: expect.any(Date) } },
      });
    });

    it('rejects and mutates nothing when a live row is outside expectedAssignmentIds', async () => {
      // Simulates a sibling scheduled in a week the caller never loaded, created after its last reload.
      prisma.schedulerAssignment.findMany.mockResolvedValue([{ id: 'row-a' }, { id: 'row-unknown' }]);

      await expect(
        service.updateStatus(TASK_ID, 'hod-1', UserRole.HOD, {
          status: 'ON_HOLD',
          expectedAssignmentIds: ['row-a'],
        } as any),
      ).rejects.toThrow('Another scheduled part of this task changed');

      expect(prisma.task.update).not.toHaveBeenCalled();
      expect(prisma.schedulerAssignment.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getHoldImpact', () => {
    it('returns zero impact when nothing is scheduled from today onward', async () => {
      prisma.schedulerAssignment.findMany.mockResolvedValue([]);

      const result = await service.getHoldImpact(TASK_ID);

      expect(result).toEqual({ partCount: 0, designers: [] });
      expect(prisma.schedulerAssignment.findMany).toHaveBeenCalledWith({
        where: { taskId: TASK_ID, weekStartDate: { gte: expect.any(Date) } },
        select: { designerId: true, designer: { select: { fullName: true } } },
      });
    });

    it('groups current/future parts by designer, largest first', async () => {
      prisma.schedulerAssignment.findMany.mockResolvedValue([
        { designerId: 'alex', designer: { fullName: 'Alex Johnson' } },
        { designerId: 'ben', designer: { fullName: 'Benjamin' } },
        { designerId: 'alex', designer: { fullName: 'Alex Johnson' } },
      ]);

      const result = await service.getHoldImpact(TASK_ID);

      expect(result).toEqual({
        partCount: 3,
        designers: [
          { designerId: 'alex', designerName: 'Alex Johnson', partCount: 2 },
          { designerId: 'ben', designerName: 'Benjamin', partCount: 1 },
        ],
      });
    });

    it('rejects a non-UUID task id', async () => {
      await expect(service.getHoldImpact('not-a-uuid')).rejects.toThrow('Invalid task id');
    });
  });

  describe('freezeDraftWorkSession', () => {
    const DESIGNER_ID = 'ffffffff-1111-4222-8333-444444444444';
    const draftSession = {
      id: 'session-1',
      taskId: TASK_ID,
      designerId: DESIGNER_ID,
      durationSeconds: 3600,
      runStartedAt: new Date('2026-07-10T09:00:00.000Z'),
      status: 'Draft',
    };

    beforeEach(() => {
      prisma.task.findUnique.mockResolvedValue({ id: TASK_ID, taskNo: 'T-100', designType: 'Project' });
      prisma.taskWorkSession.findFirst.mockResolvedValue(draftSession);
      prisma.taskWorkSession.findMany.mockResolvedValue([]);
      prisma.taskWorkSession.update.mockResolvedValue({});
      notificationsService.create.mockResolvedValue({});
    });

    it('notifies the designer when closeSession is false and the timer was running', async () => {
      await service.freezeDraftWorkSession(TASK_ID, DESIGNER_ID, false);

      expect(notificationsService.create).toHaveBeenCalled();
      const createCall = (notificationsService.create as jest.Mock).mock.calls[0][0];
      expect(createCall.userId).toBe(DESIGNER_ID);
      expect(createCall.title).toBe('Timer Paused — T-100');
      expect(createCall.linkUrl).toBe(`/project-task-view/${TASK_ID}`);
      expect(dashboardRealtime.notifyTimerPaused).toHaveBeenCalledWith(DESIGNER_ID, TASK_ID, false);
    });

    it('does not notify when closeSession is true (session fully handed off)', async () => {
      await service.freezeDraftWorkSession(TASK_ID, DESIGNER_ID, true);

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(dashboardRealtime.notifyTimerPaused).toHaveBeenCalledWith(DESIGNER_ID, TASK_ID, true);
    });

    it('does not notify when closeSession is false but there was no running timer', async () => {
      prisma.taskWorkSession.findFirst.mockResolvedValue({ ...draftSession, runStartedAt: null });

      await service.freezeDraftWorkSession(TASK_ID, DESIGNER_ID, false);

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(dashboardRealtime.notifyTimerPaused).not.toHaveBeenCalled();
    });
  });

  describe('resolveNextPhase — smart phase suggestion tie-break', () => {
    const resolveNextPhase = (context: any, signTypes: any[]) =>
      (service as any).resolveNextPhase(context, signTypes);

    it('suggests project-wide maxPhase + 1 when none of the checked sign types have history', () => {
      const context = { maxPhase: 3, bySignType: new Map([['Pylon', 2]]) };

      expect(resolveNextPhase(context, ['Monolith', 'Directional'])).toBe(4);
    });

    it('suggests project-wide phase 1 when the project has no history at all', () => {
      const context = { maxPhase: 0, bySignType: new Map() };

      expect(resolveNextPhase(context, ['Pylon'])).toBe(1);
    });

    it('continues a single checked sign type\'s own lineage (its last phase + 1)', () => {
      const context = { maxPhase: 3, bySignType: new Map([['Pylon', 1], ['Monolith', 3]]) };

      expect(resolveNextPhase(context, ['Pylon'])).toBe(2);
    });

    it('picks the max lineage + 1 when checked sign types disagree', () => {
      const context = { maxPhase: 3, bySignType: new Map([['Pylon', 1], ['Monolith', 3]]) };

      expect(resolveNextPhase(context, ['Pylon', 'Monolith'])).toBe(4);
    });

    it('ignores null/blank sign types and dedupes repeats', () => {
      const context = { maxPhase: 2, bySignType: new Map([['Pylon', 2]]) };

      expect(resolveNextPhase(context, ['Pylon', 'Pylon', null, undefined])).toBe(3);
    });
  });

  describe('getNextPhase', () => {
    it('resolves projectId from projectNo/opNo when not given, and reports project-wide history', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'project-1', projectNo: 'P-1' });
      prisma.task.findMany.mockResolvedValue([
        { phase: 1, signType: 'Pylon' },
        { phase: 2, signType: 'Monolith' },
        { phase: 2, signType: 'Pylon' },
      ]);

      const result = await service.getNextPhase({ projectNo: 'P-1', opNo: 'OP-1', designType: 'Project' });

      expect(result).toEqual({
        projectId: 'project-1',
        maxPhase: 2,
        bySignType: { Pylon: { maxPhase: 2 }, Monolith: { maxPhase: 2 } },
      });
    });

    it('returns maxPhase 0 and no sign-type history for a project with no prior phased tasks', async () => {
      prisma.task.findMany.mockResolvedValue([]);

      const result = await service.getNextPhase({ projectId: 'project-2' });

      expect(result).toEqual({ projectId: 'project-2', maxPhase: 0, bySignType: {} });
    });
  });

  describe('createExtended — phase (Project path)', () => {
    const projectRow = {
      id: 'project-1',
      projectNo: 'P-1',
      name: 'Project One',
      category: 'Project',
      businessUnit: null,
      description: null,
      status: 'ACTIVE',
      salesPerson: null,
      technicalHead: 'TH',
      teamLead: 'TL',
      subTeamLead: 'STL',
      designers: 'Alex',
      createdById: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    beforeEach(() => {
      prisma.project.findFirst.mockResolvedValue(projectRow);
      prisma.$queryRaw.mockResolvedValue([{ status: 'completed' }]);
      prisma.user.findMany.mockResolvedValue([]); // no QS users, no assignee → both fan-out branches skip
      prisma.task.findMany.mockResolvedValue([]); // no prior revision/phase history
      let taskSeq = 0;
      prisma.task.create.mockImplementation(() => Promise.resolve({ id: `task-${++taskSeq}` }));
      prisma.projectTaskDetail.create.mockImplementation(() => Promise.resolve({ id: `detail-${taskSeq}` }));
      prisma.task.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve({
          id: where.id,
          taskNo: `T-${where.id}`,
          opNo: 'OP-1',
          title: 'Signage',
          status: 'DESIGN_NEW',
          assigneeId: null,
          assignee: null,
          project: { id: 'project-1', projectNo: 'P-1', name: 'Project One' },
        }),
      );
    });

    it('writes the explicitly-requested phase onto every task created in the submission', async () => {
      const dto: any = {
        designType: 'Project',
        task: { projectNo: 'P-1', projectName: 'Project One', opNo: 'OP-1', phase: 5 },
        projectDetails: [
          { signType: 'Pylon', disciplineType: 'Artwork', artwork: true, artworkHours: 2 },
          { signType: 'Monolith', disciplineType: 'Technical', technical: true, technicalHours: 3 },
        ],
      };

      await service.createExtended('user-1', dto);

      const phasesWritten = prisma.task.create.mock.calls.map((call: any) => call[0].data.phase);
      expect(phasesWritten).toEqual([5, 5]);
    });

    it('rejects a phase below 1', async () => {
      const dto: any = {
        designType: 'Project',
        task: { projectNo: 'P-1', projectName: 'Project One', opNo: 'OP-1', phase: 0 },
        projectDetails: [{ signType: 'Pylon', disciplineType: 'Artwork', artwork: true, artworkHours: 2 }],
      };

      await expect(service.createExtended('user-1', dto)).rejects.toThrow(
        'phase must be a positive integer',
      );
      expect(prisma.task.create).not.toHaveBeenCalled();
    });

    it('auto-resolves phase to 1 when omitted and the project has no prior phased tasks', async () => {
      const dto: any = {
        designType: 'Project',
        task: { projectNo: 'P-1', projectName: 'Project One', opNo: 'OP-1' },
        projectDetails: [{ signType: 'Pylon', disciplineType: 'Artwork', artwork: true, artworkHours: 2 }],
      };

      await service.createExtended('user-1', dto);

      expect(prisma.task.create.mock.calls[0][0].data.phase).toBe(1);
    });
  });

  describe('updateStatus — previously-silent transitions now notify', () => {
    it('HOD_REVIEW notifies HOD/ADMIN users', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'hod-1' }]);

      await service.updateStatus(TASK_ID, 'designer-1', UserRole.DESIGNER, { status: 'HOD_REVIEW' } as any);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'hod-1', title: expect.stringContaining('HOD Review') }),
      );
      expect(dashboardRealtime.notifyUserNotificationRefresh).toHaveBeenCalledWith('hod-1');
    });

    it('CLIENT_REJECTED creates the next revision, notifies designers with the new-task link, and notifies stakeholders once', async () => {
      const revisionTask = { id: 'rev-task-1', taskNo: 'T-101' };
      prisma.task.update
        .mockResolvedValueOnce({ ...updatedTask, status: 'CLIENT_REJECTED' })
        .mockResolvedValueOnce(revisionTask);
      prisma.task.findUnique
        .mockResolvedValueOnce({ ...existingTask, status: 'SALES_REVIEW' })
        .mockResolvedValueOnce({ retailDetails: [], projectDetails: [] });
      prisma.task.create.mockResolvedValue(revisionTask);
      prisma.task.findMany.mockResolvedValue([{ revisionCode: 'R0' }]);
      prisma.user.findMany.mockResolvedValue([{ id: 'hod-1' }, { id: 'sales-1' }]);

      const result = await service.updateStatus(TASK_ID, 'sales-1', UserRole.SALESPERSON, {
        status: 'CLIENT_REJECTED',
        reworkNote: 'Client wants new pack',
      } as any);

      expect(prisma.task.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            revisionCode: 'R1',
            status: 'DESIGN_NEW',
            assigneeId: null,
          }),
        }),
      );
      // Follow-up update attaches previousRevisionTaskId + reject note on the new task
      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: revisionTask.id },
          data: expect.objectContaining({
            previousRevisionTaskId: TASK_ID,
            reworkNote: 'Client wants new pack',
          }),
        }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'designer-1',
          title: 'Client Rejected Task',
          linkUrl: expect.stringContaining(revisionTask.id),
          message: expect.stringContaining(revisionTask.taskNo),
        }),
      );
      const newRevisionNotifs = notificationsService.create.mock.calls.filter(
        ([payload]: any[]) => payload?.title === `New Revision Created — ${revisionTask.taskNo}`,
      );
      expect(newRevisionNotifs).toHaveLength(2);
      expect(newRevisionNotifs.map(([p]: any[]) => p.userId).sort()).toEqual(['hod-1', 'sales-1']);
      expect(result.newRevisionTaskId).toBe(revisionTask.id);
      expect(result.newRevisionTaskNo).toBe(revisionTask.taskNo);
    });

    it('entering ON_HOLD notifies the assignee that the task was put on hold', async () => {
      await service.updateStatus(TASK_ID, 'hod-1', UserRole.HOD, { status: 'ON_HOLD' } as any);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'designer-1', title: 'Task Put On Hold' }),
      );
    });

    it('resuming from ON_HOLD notifies the assignee that the task resumed', async () => {
      prisma.task.findUnique.mockResolvedValue({ ...existingTask, status: 'ON_HOLD', holdPreviousStatus: 'IN_PROGRESS' });

      await service.updateStatus(TASK_ID, 'hod-1', UserRole.HOD, { status: 'IN_PROGRESS' } as any);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'designer-1', title: 'Task Resumed' }),
      );
    });
  });

  describe('updateStatus — rework vs client-reject revision rules', () => {
    it('REWORK keeps the same task, persists instructions, and does not create a revision', async () => {
      prisma.task.findUnique.mockResolvedValue({ ...existingTask, status: 'SALES_REVIEW' });
      prisma.task.update.mockResolvedValue({
        ...updatedTask,
        status: 'REWORK',
        assigneeId: 'designer-1',
        reworkNote: 'Fix sheet 3',
      });
      prisma.user.findMany.mockResolvedValue([{ id: 'hod-1' }, { id: 'sales-other' }, { id: 'sales-1' }]);

      const result = await service.updateStatus(TASK_ID, 'sales-1', UserRole.SALESPERSON, {
        status: 'REWORK',
        reworkNote: 'Fix sheet 3',
      } as any);

      expect(prisma.task.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TASK_ID },
          data: expect.objectContaining({
            status: 'REWORK',
            reworkNote: 'Fix sheet 3',
          }),
        }),
      );
      expect(prisma.task.create).not.toHaveBeenCalled();
      expect(result.newRevisionTaskId).toBeUndefined();
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'designer-1', title: expect.stringContaining('Rework Issued') }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'hod-1', title: expect.stringContaining('Rework Issued') }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'sales-other', title: expect.stringContaining('Rework Issued') }),
      );
      // Actor who issued rework is not re-notified as a stakeholder
      expect(notificationsService.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'sales-1', title: expect.stringContaining('Rework Issued') }),
      );
      expect(prisma.chatterPost.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taskId: TASK_ID, title: 'Rework Instructions' }),
        }),
      );
    });

    it('SALES_REVIEW notifies salesperson and admin', async () => {
      prisma.task.update.mockResolvedValue({ ...updatedTask, status: 'SALES_REVIEW' });
      prisma.user.findMany.mockResolvedValue([{ id: 'sales-1' }, { id: 'admin-1' }]);

      await service.updateStatus(TASK_ID, 'hod-1', UserRole.HOD, { status: 'SALES_REVIEW' } as any);

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'sales-1', title: expect.stringContaining('Ready for Review') }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', title: expect.stringContaining('Ready for Review') }),
      );
    });

    it('forbids designers from issuing REWORK', async () => {
      await expect(
        service.updateStatus(TASK_ID, 'designer-1', UserRole.DESIGNER, { status: 'REWORK' } as any),
      ).rejects.toThrow('Only SALESPERSON or ADMIN can issue rework');
    });

    it('forbids designers from marking CLIENT_REJECTED', async () => {
      await expect(
        service.updateStatus(TASK_ID, 'designer-1', UserRole.DESIGNER, { status: 'CLIENT_REJECTED' } as any),
      ).rejects.toThrow('Only SALESPERSON or ADMIN can mark client rejected');
    });
  });

  describe('assign — split-task reassignment', () => {
    it('recognizes reassigning a split task (assigneeId=null) as a real reassignment and notifies removed designers', async () => {
      prisma.task.findUnique.mockResolvedValue({ id: TASK_ID, assigneeId: null, status: 'DESIGN_PLANNED' });
      prisma.taskDesigner.findMany.mockResolvedValue([
        { designerId: 'designer-a' },
        { designerId: 'designer-b' },
      ]);
      prisma.user.findUnique.mockResolvedValue({ id: 'designer-d', fullName: 'Designer D' });
      prisma.task.update.mockResolvedValue({ ...updatedTask, assigneeId: 'designer-d' });

      await service.assign(TASK_ID, 'hod-1', { assigneeId: 'designer-d' } as any);

      expect(dashboardRealtime.notifyOverviewRefresh).toHaveBeenCalledWith(
        'task_reassigned',
        expect.objectContaining({ taskId: TASK_ID }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'designer-a', title: 'Removed from Task' }),
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'designer-b', title: 'Removed from Task' }),
      );
    });

    it('does not treat assigning an already-sole-designer task to the same person as a reassignment', async () => {
      prisma.task.findUnique.mockResolvedValue({ id: TASK_ID, assigneeId: 'designer-a', status: 'IN_PROGRESS' });
      prisma.taskDesigner.findMany.mockResolvedValue([{ designerId: 'designer-a' }]);
      prisma.user.findUnique.mockResolvedValue({ id: 'designer-a', fullName: 'Designer A' });
      prisma.task.update.mockResolvedValue({ ...updatedTask, assigneeId: 'designer-a' });

      await service.assign(TASK_ID, 'hod-1', { assigneeId: 'designer-a' } as any);

      expect(dashboardRealtime.notifyOverviewRefresh).not.toHaveBeenCalledWith(
        'task_reassigned',
        expect.anything(),
      );
      expect(notificationsService.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Removed from Task' }),
      );
    });
  });
});
