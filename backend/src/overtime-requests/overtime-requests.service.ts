import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TaskFilesService } from '../tasks/task-files.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction, type ActivityActionType, type ActivityDetailsPayload } from '../activities/activity-events';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';
import { UpdateOvertimeRequestDto } from './dto/update-overtime-request.dto';
import { ReviewOvertimeRequestDto } from './dto/review-overtime-request.dto';
import { UserRole } from '../common/constants/roles.enum';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class OvertimeRequestsService {
  private readonly logger = new Logger(OvertimeRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskFilesService: TaskFilesService,
    private readonly activityLogger: ActivityLoggerService,
  ) {}

  /**
   * Helper to parse time string "HH:mm" into minutes from midnight.
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Helper to determine Monday of the week for a given date.
   */
  private getStartOfWeek(date: Date): Date {
    const temp = new Date(date);
    const day = temp.getUTCDay();
    const diff = temp.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
    const startOfWeek = new Date(Date.UTC(temp.getUTCFullYear(), temp.getUTCMonth(), diff));
    startOfWeek.setUTCHours(0, 0, 0, 0);
    return startOfWeek;
  }

  /**
   * Helper to determine Sunday of the week for a given date.
   */
  private getEndOfWeek(date: Date): Date {
    const start = this.getStartOfWeek(date);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
    return end;
  }

  /**
   * Core policy validations for Overtime request creation or updates.
   */
  private async validatePolicyRules(
    designerId: string,
    dateStr: string,
    startTime: string,
    endTime: string,
    taskId: string,
    excludeRequestId?: string,
  ) {
    const requestDate = new Date(dateStr);
    const startMinutes = this.timeToMinutes(startTime);
    const endMinutes = this.timeToMinutes(endTime);

    // 1. Start/End Time Validation
    if (endMinutes <= startMinutes) {
      throw new BadRequestException('End time must be greater than start time');
    }

    // Daily limit: 8 hours max
    const hours = (endMinutes - startMinutes) / 60;
    if (hours > 8) {
      throw new BadRequestException('Overtime cannot exceed 8 hours per day');
    }

    // 2. Prevent Duplicate Submissions for same date & task
    const duplicate = await this.prisma.overtimeRequest.findFirst({
      where: {
        id: excludeRequestId ? { not: excludeRequestId } : undefined,
        designerId,
        taskId,
        date: requestDate,
        status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED_BY_MANAGER', 'APPROVED'] },
      },
    });
    if (duplicate) {
      throw new BadRequestException('An active request for this task and date already exists');
    }

    // 3. Overlap Check
    const activeRequests = await this.prisma.overtimeRequest.findMany({
      where: {
        id: excludeRequestId ? { not: excludeRequestId } : undefined,
        designerId,
        date: requestDate,
        status: { in: ['SUBMITTED', 'APPROVED_BY_MANAGER', 'APPROVED'] },
      },
    });

    for (const req of activeRequests) {
      if (req.startTime && req.endTime) {
        const reqStart = this.timeToMinutes(req.startTime);
        const reqEnd = this.timeToMinutes(req.endTime);
        const overlap = Math.max(startMinutes, reqStart) < Math.min(endMinutes, reqEnd);
        if (overlap) {
          throw new BadRequestException(`Overtime overlaps with an existing request (${req.startTime} - ${req.endTime})`);
        }
      }
    }

    // 4. Weekly Limit Check (24 hours max)
    const weekStart = this.getStartOfWeek(requestDate);
    const weekEnd = this.getEndOfWeek(requestDate);

    const weeklyRequests = await this.prisma.overtimeRequest.findMany({
      where: {
        id: excludeRequestId ? { not: excludeRequestId } : undefined,
        designerId,
        date: {
          gte: weekStart,
          lte: weekEnd,
        },
        status: { in: ['SUBMITTED', 'APPROVED_BY_MANAGER', 'APPROVED'] },
      },
    });

    const weeklyApprovedHours = weeklyRequests.reduce((sum, req) => {
      const start = this.timeToMinutes(req.startTime || '00:00');
      const end = this.timeToMinutes(req.endTime || '00:00');
      return sum + (end - start) / 60;
    }, 0);

    if (weeklyApprovedHours + hours > 24) {
      throw new BadRequestException(
        `Weekly overtime limit exceeded. You have ${weeklyApprovedHours} hours requested/approved this week. Max is 24 hours.`,
      );
    }
  }

  private parseHoursFromLabel(label: string): number {
    const match = /^(\d+(?:\.\d+)?)/.exec(String(label ?? '').trim());
    const hours = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new BadRequestException('requestedHours must include a positive number of hours');
    }
    return hours;
  }

  private parseOptionalHoursLabel(value?: string): Decimal | undefined {
    if (!value?.trim()) return undefined;
    return new Decimal(this.parseHoursFromLabel(value));
  }

  private resolveSchedule(dto: CreateOvertimeRequestDto): {
    startTime: string;
    endTime: string;
    requestedHours: Decimal;
  } {
    const hours = this.parseHoursFromLabel(dto.requestedHours);
    if (dto.startTime && dto.endTime) {
      return {
        startTime: dto.startTime,
        endTime: dto.endTime,
        requestedHours: new Decimal(hours),
      };
    }
    const startTime = '18:00';
    const endMinutes = this.timeToMinutes(startTime) + Math.round(hours * 60);
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;
    return { startTime, endTime, requestedHours: new Decimal(hours) };
  }

  private normalizeCreateStatus(status?: string): string {
    const normalized = (status ?? '').trim().toUpperCase();
    if (normalized === 'PENDING') return 'SUBMITTED';
    if (normalized === 'SUBMITTED' || normalized === 'DRAFT') return normalized;
    return 'DRAFT';
  }

  private readonly overtimeActivityTaskSelect = {
    id: true,
    title: true,
    taskNo: true,
    opNo: true,
    project: { select: { name: true, projectNo: true } },
  } as const;

  private buildOvertimeActivityDetails(
    request: {
      id: string;
      designerId?: string | null;
      date?: Date | null;
      totalHours?: Decimal | null;
      requestedHours?: Decimal | null;
      taskId?: string | null;
      task?: {
        id: string;
        title?: string | null;
        taskNo?: string | null;
        opNo?: string | null;
        project?: { name?: string | null; projectNo?: string | null } | null;
      } | null;
      designer?: { fullName?: string | null } | null;
    },
    action: ActivityActionType,
    messageKey: string,
    extra?: { changes?: Record<string, unknown> },
  ): ActivityDetailsPayload {
    const hours = request.requestedHours ?? request.totalHours;
    const hoursLabel =
      hours instanceof Decimal ? hours.toString() : hours != null ? String(hours) : undefined;

    return {
      event: action,
      messageKey,
      taskSnapshot: request.task
        ? {
            id: request.task.id,
            taskNo: request.task.taskNo ?? undefined,
            opNo: request.task.opNo ?? undefined,
            title: request.task.title ?? undefined,
          }
        : undefined,
      projectSnapshot: request.task?.project
        ? {
            name: request.task.project.name ?? undefined,
            projectNo: request.task.project.projectNo ?? undefined,
          }
        : undefined,
      changes: {
        requestId: request.id,
        overtimeDate: request.date ? request.date.toISOString().split('T')[0] : undefined,
        requestedHours: hoursLabel,
        ...extra?.changes,
      },
      context: {
        designerId: request.designerId,
        designerName: request.designer?.fullName ?? undefined,
      },
    };
  }

  private async logOvertimeActivity(params: {
    action: ActivityActionType;
    messageKey: string;
    userId: string;
    request: {
      id: string;
      designerId?: string | null;
      date?: Date | null;
      totalHours?: Decimal | null;
      requestedHours?: Decimal | null;
      taskId?: string | null;
      task?: {
        id: string;
        title?: string | null;
        taskNo?: string | null;
        opNo?: string | null;
        project?: { name?: string | null; projectNo?: string | null } | null;
      } | null;
      designer?: { fullName?: string | null } | null;
    };
    changes?: Record<string, unknown>;
  }): Promise<void> {
    await this.activityLogger.log({
      action: params.action,
      userId: params.userId,
      taskId: params.request.taskId ?? null,
      details: this.buildOvertimeActivityDetails(params.request, params.action, params.messageKey, {
        changes: params.changes,
      }),
    });
  }

  private mapStatusForUi(status: string | null | undefined): string {
    const normalized = (status ?? '').trim().toUpperCase();
    if (normalized === 'SUBMITTED') return 'Pending Approval';
    if (normalized === 'APPROVED' || normalized === 'APPROVED_BY_MANAGER') return 'Approved';
    if (normalized.startsWith('REJECTED')) return 'Rejected';
    if (normalized === 'DRAFT') return 'Draft';
    return status?.trim() || 'Pending';
  }

  private mapRowForDesignerView(row: {
    id: string;
    date: Date | null;
    requestedHours: Decimal | null;
    approvedHours: Decimal | null;
    status: string | null;
    task: { title: string | null; taskNo: string; project?: { name: string } | null } | null;
  }) {
    const taskLabel =
      row.task?.title?.trim() ||
      row.task?.taskNo?.trim() ||
      '—';
    const projectName = row.task?.project?.name?.trim() || '—';
    return {
      id: row.id,
      date: row.date ? row.date.toISOString().split('T')[0] : '',
      projectName,
      taskTitle: taskLabel,
      taskName: projectName !== '—' ? `${projectName} — ${taskLabel}` : taskLabel,
      requested: row.requestedHours != null ? `${row.requestedHours} hours` : '—',
      approved: row.approvedHours != null ? `${row.approvedHours} hours` : '—',
      status: this.mapStatusForUi(row.status),
    };
  }

  private mapPendingApprovalRow(row: {
    id: string;
    date: Date | null;
    requestedHours: Decimal | null;
    approvedHours: Decimal | null;
    status: string | null;
    createdAt: Date | null;
    reason: string | null;
    designer: { id: string; fullName: string; department?: { name: string } | null } | null;
    task: { title: string | null; taskNo: string; project?: { name: string } | null } | null;
  }) {
    const base = this.mapRowForDesignerView(row);
    return {
      ...base,
      designerId: row.designer?.id ?? null,
      designerName: row.designer?.fullName?.trim() || 'Unknown',
      departmentName: row.designer?.department?.name?.trim() || '—',
      reason: row.reason?.trim() || '—',
      submittedAt: row.createdAt ? row.createdAt.toISOString() : null,
    };
  }

  async findByDesignerForView(designerId: string) {
    const rows = await this.prisma.overtimeRequest.findMany({
      where: { designerId },
      orderBy: { createdAt: 'desc' },
      include: {
        task: {
          select: {
            title: true,
            taskNo: true,
            project: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((row) => this.mapRowForDesignerView(row));
  }

  async findPendingApprovalsForView(managerId: string, role: UserRole) {
    const where: Record<string, unknown> = { status: 'SUBMITTED' };

    if (role === UserRole.HOD) {
      const manager = await this.prisma.user.findUnique({ where: { id: managerId }, select: { departmentId: true } });
      if (manager?.departmentId) {
        where.designer = { departmentId: manager.departmentId };
      }
    }

    const rows = await this.prisma.overtimeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        designer: { select: { id: true, fullName: true, email: true, department: { select: { name: true } } } },
        task: {
          select: {
            title: true,
            taskNo: true,
            project: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((row) => this.mapPendingApprovalRow(row));
  }

  async findOwnRequestsForView(userId: string) {
    return this.findByDesignerForView(userId);
  }

  /**
   * Creates a new Overtime Request.
   */
  async create(creatorId: string, creatorRole: UserRole, dto: CreateOvertimeRequestDto) {
    const designerId = dto.designerId || creatorId;

    // Authorization check
    if (designerId !== creatorId && creatorRole !== UserRole.HOD && creatorRole !== UserRole.ADMIN) {
      throw new ForbiddenException('You are not authorized to create request for this designer');
    }

    const task = await this.prisma.task.findUnique({
      where: { id: dto.taskId },
      select: { ...this.overtimeActivityTaskSelect, assigneeId: true },
    });
    if (!task) {
      throw new BadRequestException('Task not found. Select a valid assigned task.');
    }
    if (
      creatorRole === UserRole.DESIGNER &&
      task.assigneeId &&
      task.assigneeId !== designerId
    ) {
      throw new ForbiddenException('You can only submit overtime for tasks assigned to you');
    }

    const schedule = this.resolveSchedule(dto);

    await this.validatePolicyRules(
      designerId,
      dto.date,
      schedule.startTime,
      schedule.endTime,
      dto.taskId,
    );

    const totalHours = new Decimal(
      (this.timeToMinutes(schedule.endTime) - this.timeToMinutes(schedule.startTime)) / 60,
    );
    const status = this.normalizeCreateStatus(dto.status);

    const request = await this.prisma.overtimeRequest.create({
      data: {
        designerId,
        taskId: dto.taskId,
        date: new Date(dto.date),
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        totalHours,
        requestedHours: schedule.requestedHours,
        estimatedRemaining: dto.estimatedRemaining?.trim() || null,
        reason: dto.reason,
        status,
      },
      include: {
        designer: { select: { id: true, fullName: true, email: true, departmentId: true } },
        task: { select: this.overtimeActivityTaskSelect },
        attachments: true,
      },
    });

    // Log history
    try {
      await this.prisma.overtimeApprovalHistory.create({
        data: {
          requestId: request.id,
          action: status,
          actionById: creatorId,
          comments: 'Request initiated',
        },
      });
    } catch (err) {
      this.logger.warn(
        `Overtime history log failed for ${request.id}: ${err instanceof Error ? err.message : err}`,
      );
    }

    if (status === 'SUBMITTED') {
      await this.logOvertimeActivity({
        action: ActivityAction.OVERTIME_REQUEST_SUBMITTED,
        messageKey: 'overtime_request_submitted',
        userId: creatorId,
        request,
      });
      try {
        await this.notifyApprovers(request);
      } catch (err) {
        this.logger.warn(
          `Overtime approver notification failed for ${request.id}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return request;
  }

  /**
   * Updates an existing Overtime Request.
   */
  async update(id: string, userId: string, role: UserRole, dto: UpdateOvertimeRequestDto) {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id },
      include: { attachments: true },
    });

    if (!request) {
      throw new NotFoundException('Overtime request not found');
    }

    // Auth check
    if (request.designerId !== userId && role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own requests');
    }

    // Status check: only DRAFT or REJECTED requests can be edited
    if (request.status !== 'DRAFT' && !request.status?.startsWith('REJECTED')) {
      throw new BadRequestException('Only drafts or rejected requests can be updated');
    }

    const nextDate = dto.date || request.date?.toISOString().split('T')[0];
    const nextStart = dto.startTime || request.startTime;
    const nextEnd = dto.endTime || request.endTime;
    const nextTaskId = dto.taskId || request.taskId;

    if (!nextDate || !nextStart || !nextEnd || !nextTaskId) {
      throw new BadRequestException('Missing date, startTime, endTime, or taskId');
    }

    // Validate rules
    await this.validatePolicyRules(request.designerId!, nextDate, nextStart, nextEnd, nextTaskId, request.id);

    const totalHours = new Decimal((this.timeToMinutes(nextEnd) - this.timeToMinutes(nextStart)) / 60);
    const status = dto.status || request.status;

    const updated = await this.prisma.overtimeRequest.update({
      where: { id },
      data: {
        taskId: dto.taskId,
        date: dto.date ? new Date(dto.date) : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        totalHours,
        requestedHours: dto.requestedHours ? new Decimal(dto.requestedHours) : undefined,
        reason: dto.reason,
        status,
      },
      include: {
        designer: { select: { id: true, fullName: true, email: true, departmentId: true } },
        task: { select: this.overtimeActivityTaskSelect },
        attachments: true,
      },
    });

    // Log history
    await this.prisma.overtimeApprovalHistory.create({
      data: {
        requestId: updated.id,
        action: status || 'UPDATED',
        actionById: userId,
        comments: 'Request details updated',
      },
    });

    if (status === 'SUBMITTED' && request.status !== 'SUBMITTED') {
      await this.logOvertimeActivity({
        action: ActivityAction.OVERTIME_REQUEST_SUBMITTED,
        messageKey: 'overtime_request_submitted',
        userId,
        request: updated,
      });
    } else {
      await this.logOvertimeActivity({
        action: ActivityAction.OVERTIME_REQUEST_UPDATED,
        messageKey: 'overtime_request_updated',
        userId,
        request: updated,
      });
    }

    if (status === 'SUBMITTED' && request.status !== 'SUBMITTED') {
      await this.notifyApprovers(updated);
    }

    return updated;
  }

  /**
   * Submits a draft request.
   */
  async submit(id: string, userId: string) {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id },
      include: {
        designer: { select: { id: true, fullName: true, email: true, departmentId: true } },
        task: { select: this.overtimeActivityTaskSelect },
        attachments: true,
      },
    });

    if (!request) throw new NotFoundException('Overtime request not found');
    if (request.designerId !== userId) throw new ForbiddenException('Access denied');
    if (request.status !== 'DRAFT') throw new BadRequestException('Request is already submitted');

    const updated = await this.prisma.overtimeRequest.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        designer: { select: { id: true, fullName: true, email: true, departmentId: true } },
        task: { select: this.overtimeActivityTaskSelect },
        attachments: true,
      },
    });

    await this.prisma.overtimeApprovalHistory.create({
      data: {
        requestId: id,
        action: 'SUBMITTED',
        actionById: userId,
        comments: 'Request submitted for approval',
      },
    });

    await this.logOvertimeActivity({
      action: ActivityAction.OVERTIME_REQUEST_SUBMITTED,
      messageKey: 'overtime_request_submitted',
      userId,
      request: updated,
    });

    await this.notifyApprovers(updated);
    return updated;
  }

  /**
   * Withdraws a submitted request.
   */
  async withdraw(id: string, userId: string) {
    const request = await this.prisma.overtimeRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Overtime request not found');
    if (request.designerId !== userId) throw new ForbiddenException('Access denied');
    if (request.status !== 'SUBMITTED' && request.status !== 'APPROVED_BY_MANAGER') {
      throw new BadRequestException('Cannot withdraw request at this stage');
    }

    const updated = await this.prisma.overtimeRequest.update({
      where: { id },
      data: { status: 'WITHDRAWN' },
      include: {
        designer: { select: { id: true, fullName: true, email: true, departmentId: true } },
        task: { select: this.overtimeActivityTaskSelect },
      },
    });

    await this.prisma.overtimeApprovalHistory.create({
      data: {
        requestId: id,
        action: 'WITHDRAWN',
        actionById: userId,
        comments: 'Request withdrawn by employee',
      },
    });

    await this.logOvertimeActivity({
      action: ActivityAction.OVERTIME_REQUEST_WITHDRAWN,
      messageKey: 'overtime_request_withdrawn',
      userId,
      request: updated,
    });

    return updated;
  }

  /**
   * Deletes a draft request.
   */
  async delete(id: string, userId: string) {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id },
      include: { attachments: true },
    });

    if (!request) throw new NotFoundException('Overtime request not found');
    if (request.designerId !== userId) throw new ForbiddenException('Access denied');
    if (request.status !== 'DRAFT') throw new BadRequestException('Only draft requests can be deleted');

    // Clean up S3 attachments first
    for (const file of request.attachments) {
      try {
        await this.taskFilesService.deleteObjectByKey(file.filePath);
      } catch (err) {
        this.logger.warn(`Failed to delete S3 attachment ${file.filePath}: ${err.message}`);
      }
    }

    await this.prisma.overtimeRequest.delete({ where: { id } });
    return { success: true, message: 'Draft deleted successfully' };
  }

  /**
   * Retrieves single Overtime Request detail.
   */
  async findOne(id: string, userId: string, role: UserRole) {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id },
      include: {
        designer: { select: { id: true, fullName: true, email: true, departmentId: true, department: { select: { name: true } } } },
        task: { select: { id: true, title: true, taskNo: true, project: { select: { name: true } } } },
        attachments: true,
        history: {
          include: {
            actionBy: { select: { id: true, fullName: true, role: { select: { name: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!request) throw new NotFoundException('Overtime request not found');

    // Auth check: Owner, manager of same dept, or admin
    if (request.designerId !== userId && role !== UserRole.ADMIN) {
      if (role === UserRole.HOD) {
        const viewer = await this.prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
        if (viewer?.departmentId !== request.designer?.departmentId) {
          throw new ForbiddenException('Access denied');
        }
      } else {
        throw new ForbiddenException('Access denied');
      }
    }

    // Resolve attachment S3 read URLs
    const attachments = await Promise.all(
      request.attachments.map(async (file) => ({
        ...file,
        sizeBytes: file.sizeBytes ? Number(file.sizeBytes) : null,
        url: await this.taskFilesService.createSignedReadUrl(file.filePath),
      })),
    );

    return { ...request, attachments };
  }

  /**
   * Lists request history for the calling designer.
   */
  async findOwnRequests(userId: string, filters: { status?: string; startDate?: string; endDate?: string }) {
    const where: any = { designerId: userId };
    if (filters.status) where.status = filters.status;
    if (filters.startDate || filters.endDate) {
      where.date = {};
      if (filters.startDate) where.date.gte = new Date(filters.startDate);
      if (filters.endDate) where.date.lte = new Date(filters.endDate);
    }

    return this.prisma.overtimeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        task: { select: { id: true, title: true, taskNo: true, project: { select: { name: true } } } },
        attachments: { select: { id: true, fileName: true } },
      },
    });
  }

  /**
   * Manager / HR review of overtime request.
   */
  async review(id: string, reviewerId: string, reviewerRole: UserRole, dto: ReviewOvertimeRequestDto) {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id },
      include: {
        designer: { select: { id: true, fullName: true, departmentId: true } },
        task: { select: this.overtimeActivityTaskSelect },
      },
    });

    if (!request) throw new NotFoundException('Overtime request not found');

    // Rejection requires comment check
    if ((dto.status.includes('REJECTED')) && (!dto.comments || !dto.comments.trim())) {
      throw new BadRequestException('Comments are required when rejecting a request');
    }

    // Manager / HOD Authorization and workflow
    if (dto.status === 'APPROVED_BY_MANAGER' || dto.status === 'REJECTED_BY_MANAGER') {
      if (reviewerRole !== UserRole.HOD && reviewerRole !== UserRole.ADMIN) {
        throw new ForbiddenException('Only managers can perform manager reviews');
      }
      if (request.status !== 'SUBMITTED') {
        throw new BadRequestException('Request is not in a submittable state for manager review');
      }

      const updateData: any = {
        status: dto.status,
        managerComments: dto.comments,
      };

      if (dto.status === 'APPROVED_BY_MANAGER') {
        updateData.approvedHours =
          this.parseOptionalHoursLabel(dto.approvedHours) ?? request.totalHours;
        updateData.approvedById = reviewerId;
        updateData.approvedAt = new Date();
      } else {
        updateData.rejectedById = reviewerId;
        updateData.rejectedAt = new Date();
      }

      const updated = await this.prisma.overtimeRequest.update({
        where: { id },
        data: updateData,
        include: {
          designer: { select: { id: true, fullName: true, email: true } },
          task: { select: this.overtimeActivityTaskSelect },
        },
      });

      await this.prisma.overtimeApprovalHistory.create({
        data: {
          requestId: id,
          action: dto.status,
          actionById: reviewerId,
          comments: dto.comments || 'Manager review completed',
        },
      });

      const approved = dto.status === 'APPROVED_BY_MANAGER';
      await this.logOvertimeActivity({
        action: approved
          ? ActivityAction.OVERTIME_REQUEST_APPROVED
          : ActivityAction.OVERTIME_REQUEST_REJECTED,
        messageKey: approved ? 'overtime_request_approved' : 'overtime_request_rejected',
        userId: reviewerId,
        request: { ...request, ...updated, task: updated.task ?? request.task },
        changes: {
          newStatus: dto.status,
          approvedHours: dto.approvedHours ?? null,
          reviewStage: 'manager',
        },
      });

      // Notify Designer and HR/Admin
      await this.notifyDesignerOfReview(updated, dto.status, dto.comments);
      if (dto.status === 'APPROVED_BY_MANAGER') {
        await this.notifyHrOfPending(updated);
      }

      return updated;
    }

    // HR / Admin Final Review
    if (dto.status === 'APPROVED' || dto.status === 'REJECTED_BY_HR') {
      if (reviewerRole !== UserRole.ADMIN) {
        throw new ForbiddenException('Only HR / Admin can perform final reviews');
      }
      if (request.status !== 'APPROVED_BY_MANAGER') {
        throw new BadRequestException('Request must first be approved by department HOD');
      }

      const updateData: any = {
        status: dto.status,
        hrComments: dto.comments,
      };

      if (dto.status === 'APPROVED') {
        updateData.approvedHours =
          this.parseOptionalHoursLabel(dto.approvedHours) ?? request.approvedHours;
        updateData.approvedById = reviewerId;
        updateData.approvedAt = new Date();
      } else {
        updateData.rejectedById = reviewerId;
        updateData.rejectedAt = new Date();
      }

      const updated = await this.prisma.overtimeRequest.update({
        where: { id },
        data: updateData,
        include: {
          designer: { select: { id: true, fullName: true, email: true } },
          task: { select: this.overtimeActivityTaskSelect },
        },
      });

      await this.prisma.overtimeApprovalHistory.create({
        data: {
          requestId: id,
          action: dto.status,
          actionById: reviewerId,
          comments: dto.comments || 'Final review completed',
        },
      });

      const approved = dto.status === 'APPROVED';
      await this.logOvertimeActivity({
        action: approved
          ? ActivityAction.OVERTIME_REQUEST_APPROVED
          : ActivityAction.OVERTIME_REQUEST_REJECTED,
        messageKey: approved ? 'overtime_request_approved' : 'overtime_request_rejected',
        userId: reviewerId,
        request: { ...request, ...updated, task: updated.task ?? request.task },
        changes: {
          newStatus: dto.status,
          approvedHours: dto.approvedHours ?? null,
          reviewStage: 'hr',
        },
      });

      // Notify Designer
      await this.notifyDesignerOfReview(updated, dto.status, dto.comments);

      return updated;
    }

    throw new BadRequestException('Invalid review status action');
  }

  /**
   * HOD lists pending reviews from their department.
   */
  async findPendingApprovals(managerId: string, role: UserRole) {
    const where: any = { status: 'SUBMITTED' };

    // If HOD, filter by department
    if (role === UserRole.HOD) {
      const manager = await this.prisma.user.findUnique({ where: { id: managerId }, select: { departmentId: true } });
      if (manager?.departmentId) {
        where.designer = { departmentId: manager.departmentId };
      }
    }

    return this.prisma.overtimeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        designer: { select: { id: true, fullName: true, email: true, department: { select: { name: true } } } },
        task: { select: { id: true, title: true, taskNo: true, project: { select: { name: true } } } },
      },
    });
  }

  /**
   * HOD views all team overtime requests.
   */
  async findTeamRequests(managerId: string, role: UserRole, filters: { status?: string; designerId?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.designerId) where.designerId = filters.designerId;

    if (role === UserRole.HOD) {
      const manager = await this.prisma.user.findUnique({ where: { id: managerId }, select: { departmentId: true } });
      if (manager?.departmentId) {
        where.designer = { departmentId: manager.departmentId };
      }
    }

    return this.prisma.overtimeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        designer: { select: { id: true, fullName: true, email: true, department: { select: { name: true } } } },
        task: { select: { id: true, title: true, taskNo: true, project: { select: { name: true } } } },
      },
    });
  }

  /**
   * HR/Admin lists all requests with search/filter/pagination.
   */
  async findAllRequests(filters: {
    status?: string;
    designerId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, designerId, search, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (designerId) where.designerId = designerId;
    if (search) {
      where.OR = [
        { reason: { contains: search } },
        { designer: { fullName: { contains: search } } },
        { task: { title: { contains: search } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          designer: { select: { id: true, fullName: true, email: true, department: { select: { name: true } } } },
          task: { select: { id: true, title: true, taskNo: true, project: { select: { name: true } } } },
        },
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Upload an attachment to a request.
   */
  async uploadAttachment(requestId: string, file: Express.Multer.File, userId: string) {
    const request = await this.prisma.overtimeRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Overtime request not found');
    if (request.designerId !== userId) throw new ForbiddenException('Access denied');

    const uploaded = await this.taskFilesService.uploadTaskFile(file, userId);
    
    return this.prisma.overtimeAttachment.create({
      data: {
        overtimeRequestId: requestId,
        fileName: uploaded.fileName,
        filePath: uploaded.key,
        mimeType: uploaded.mimeType,
        sizeBytes: BigInt(uploaded.size),
      },
    });
  }

  /**
   * Fetch company statistics for overtime.
   */
  async getStatistics() {
    const all = await this.prisma.overtimeRequest.findMany({
      select: {
        status: true,
        totalHours: true,
        approvedHours: true,
      },
    });

    const stats = {
      totalRequests: all.length,
      pendingApproval: all.filter((r) => r.status === 'SUBMITTED' || r.status === 'APPROVED_BY_MANAGER').length,
      fullyApproved: all.filter((r) => r.status === 'APPROVED').length,
      rejected: all.filter((r) => r.status?.startsWith('REJECTED')).length,
      totalApprovedHours: all
        .filter((r) => r.status === 'APPROVED')
        .reduce((sum, r) => sum + Number(r.approvedHours || 0), 0),
      totalRequestedHours: all
        .filter((r) => r.status !== 'DRAFT' && r.status !== 'WITHDRAWN')
        .reduce((sum, r) => sum + Number(r.totalHours || 0), 0),
    };

    return stats;
  }

  /**
   * Export reports.
   */
  async exportReport(status?: string) {
    const where = status ? { status } : {};
    return this.prisma.overtimeRequest.findMany({
      where,
      include: {
        designer: { select: { fullName: true, email: true, department: { select: { name: true } } } },
        task: { select: { title: true, taskNo: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // --- Notification Helpers ---

  private overtimeLink(requestId: string, designerId?: string): string {
    const params = new URLSearchParams({ overtimeId: requestId });
    if (designerId?.trim()) params.set('forDesignerId', designerId.trim());
    return `/designer/requests?${params.toString()}#overtime`;
  }

  private async notifyApprovers(request: any) {
    // Notify department HOD
    const deptId = request.designer?.departmentId;
    let hods: Array<{ id: string }> = [];
    if (deptId) {
      hods = await this.prisma.user.findMany({
        where: {
          departmentId: deptId,
          role: { name: UserRole.HOD },
        },
        select: { id: true },
      });
    }
    if (hods.length === 0) {
      hods = await this.prisma.user.findMany({
        where: { role: { name: UserRole.HOD } },
        select: { id: true },
      });
    }

    const taskLabel = request.task?.title?.trim() || request.task?.taskNo?.trim() || 'task';
    for (const hod of hods) {
      try {
        await this.prisma.notification.create({
          data: {
            id: randomUUID(),
            userId: hod.id,
            title: 'New Overtime Request Submitted',
            message: `${request.designer.fullName} has submitted an overtime request for ${request.totalHours} hours on ${request.date.toISOString().split('T')[0]} (${taskLabel}).`,
            linkUrl: this.overtimeLink(request.id, request.designerId),
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to notify HOD ${hod.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  private async notifyHrOfPending(request: any) {
    // Notify all Admins (HR Role equivalent)
    const admins = await this.prisma.user.findMany({
      where: {
        role: { name: UserRole.ADMIN },
      },
    });

    for (const admin of admins) {
      await this.prisma.notification.create({
        data: {
          id: randomUUID(),
          userId: admin.id,
          title: 'Overtime Request Pending Final HR Approval',
          message: `${request.designer.fullName}'s overtime request has been approved by the manager and requires final HR sign-off.`,
          linkUrl: this.overtimeLink(request.id, request.designerId),
        },
      });
    }
  }

  private async notifyDesignerOfReview(request: any, action: string, comments?: string) {
    const actionLabel = action.replace(/_/g, ' ');
    await this.prisma.notification.create({
      data: {
        id: randomUUID(),
        userId: request.designerId,
        title: `Overtime Request: ${actionLabel}`,
        message: `Your overtime request for ${request.date.toISOString().split('T')[0]} has been ${actionLabel.toLowerCase()}.${
          comments ? ` Comment: "${comments}"` : ''
        }`,
        linkUrl: this.overtimeLink(request.id, request.designerId),
      },
    });
  }
}
