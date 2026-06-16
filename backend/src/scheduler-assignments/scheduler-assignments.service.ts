import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';
import { SaveSchedulerWeekDto } from './dto/save-scheduler-week.dto';
import { UserRole } from '../common/constants/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';

type RawAssignmentRow = {
  id: string;
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: string | number | null;
  parentId: string | null;
  splitIndex: number | null;
  totalParts: number | null;
  weekStartDate: Date;
  weekEndDate: Date;
  notes: string | null;
  isLocked: boolean | number | null;
  assignedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SchedulerAssignmentDto = {
  id: string;
  designerId: string;
  taskId: string;
  dayIndex: number;
  assignedHours: number;
  parentId: string | null;
  splitIndex: number | null;
  totalParts: number | null;
  weekStartDate: string;
  weekEndDate: string;
  notes: string | null;
  isLocked: boolean;
  assignedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type SchedulerWeekMetaDto = {
  weekStart: string;
  version: number;
  isLocked: boolean;
  updatedAt: string;
  updatedBy: string | null;
};

const DAILY_CAPACITY = 8;
const MAX_DAILY_HOURS = 12;

@Injectable()
export class SchedulerAssignmentsService {
  private readonly logger = new Logger(SchedulerAssignmentsService.name);
  constructor(
    private readonly prisma: PrismaService,
    _config: ConfigService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  private fail(context: string, err: unknown): never {
    const msg = err instanceof Error ? err.message : String(err);
    this.logger.warn(`${context}: ${msg}`);
    throw new HttpException(`${context}: ${msg}`, HttpStatus.SERVICE_UNAVAILABLE);
  }

  private toIso(d: Date | null | undefined): string {
    if (d == null || isNaN(new Date(d).getTime())) return new Date(0).toISOString();
    return new Date(d).toISOString();
  }

  private toHours(value: string | number | null | undefined): number {
    if (value == null) return 0;
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(n) ? n : 0;
  }

  private toBool(value: boolean | number | null | undefined): boolean {
    if (value === true || value === 1) return true;
    return false;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value ?? '').trim(),
    );
  }

  private parseWeekStart(weekStart: string): { weekStartDate: Date; weekEndDate: Date } {
    const trimmed = weekStart.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      throw new BadRequestException('weekStart must be YYYY-MM-DD.');
    }
    const ws = new Date(`${trimmed}T00:00:00.000Z`);
    if (Number.isNaN(ws.getTime())) {
      throw new BadRequestException('Invalid weekStart date.');
    }
    const weekEndDate = new Date(ws);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
    return { weekStartDate: ws, weekEndDate };
  }

  private mapRow(row: RawAssignmentRow): SchedulerAssignmentDto {
    const parentId = row.parentId?.trim() ? row.parentId.trim() : null;
    const assignedBy = row.assignedBy?.trim() ? row.assignedBy.trim() : null;
    return {
      id: row.id,
      designerId: String(row.designerId ?? '').trim(),
      taskId: String(row.taskId ?? '').trim(),
      dayIndex: Number(row.dayIndex),
      assignedHours: this.toHours(row.assignedHours),
      parentId,
      splitIndex: row.splitIndex == null ? null : Number(row.splitIndex),
      totalParts: row.totalParts == null ? null : Number(row.totalParts),
      weekStartDate: this.toIso(row.weekStartDate ? new Date(row.weekStartDate) : null),
      weekEndDate: this.toIso(row.weekEndDate ? new Date(row.weekEndDate) : null),
      notes: row.notes ?? null,
      isLocked: this.toBool(row.isLocked),
      assignedBy,
      createdAt: this.toIso(row.createdAt ? new Date(row.createdAt) : null),
      updatedAt: this.toIso(row.updatedAt ? new Date(row.updatedAt) : null),
    };
  }

  private validateAssignments(dto: SaveSchedulerWeekDto) {
    const dayTotals = new Map<string, number>();
    const duplicateKey = new Set<string>();

    for (const row of dto.assignments) {
      if (row.dayIndex < 0 || row.dayIndex > 6) {
        throw new BadRequestException(`dayIndex must be between 0 and 6 for task ${row.taskId}`);
      }
      if (!Number.isFinite(row.assignedHours) || row.assignedHours <= 0) {
        throw new BadRequestException(`assignedHours must be > 0 for task ${row.taskId}`);
      }
      if (row.splitIndex != null && row.totalParts == null) {
        throw new BadRequestException(`totalParts is required when splitIndex is provided for task ${row.taskId}`);
      }
      if (row.totalParts != null && row.splitIndex != null && row.totalParts < row.splitIndex) {
        throw new BadRequestException(`totalParts must be >= splitIndex for task ${row.taskId}`);
      }

      const uniq = `${row.designerId}|${row.dayIndex}|${row.taskId}|${row.splitIndex ?? 0}`;
      if (duplicateKey.has(uniq)) {
        throw new BadRequestException(`Duplicate assignment row for task ${row.taskId} on day ${row.dayIndex}`);
      }
      duplicateKey.add(uniq);

      const capacityKey = `${row.designerId}|${row.dayIndex}`;
      const next = (dayTotals.get(capacityKey) ?? 0) + Number(row.assignedHours);
      if (next > MAX_DAILY_HOURS) {
        throw new BadRequestException(`Capacity exceeded (> ${MAX_DAILY_HOURS}h) for designer ${row.designerId} day ${row.dayIndex}`);
      }
      dayTotals.set(capacityKey, next);
    }
  }

  private stablePayloadHash(assignments: SaveSchedulerWeekDto['assignments']): string {
    const normalized = assignments
      .map((a) => ({
        designerId: a.designerId,
        taskId: a.taskId,
        dayIndex: a.dayIndex,
        assignedHours: Number(a.assignedHours),
        parentId: a.parentId ?? null,
        splitIndex: a.splitIndex ?? null,
        totalParts: a.totalParts ?? null,
        notes: a.notes ?? null,
      }))
      .sort((a, b) => {
        const ka = `${a.designerId}|${a.dayIndex}|${a.taskId}|${a.splitIndex ?? 0}`;
        const kb = `${b.designerId}|${b.dayIndex}|${b.taskId}|${b.splitIndex ?? 0}`;
        return ka.localeCompare(kb);
      });
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  async findForWeekStart(weekStart: string, designerId?: string): Promise<SchedulerAssignmentDto[]> {
    const { weekStartDate } = this.parseWeekStart(weekStart);

    try {
      const rows = await this.prisma.schedulerAssignment.findMany({
        where: { weekStartDate, ...(designerId ? { designerId } : {}) },
        orderBy: [{ designerId: 'asc' }, { dayIndex: 'asc' }, { id: 'asc' }],
      });
      return rows.map((r) =>
        this.mapRow({
          ...(r as unknown as RawAssignmentRow),
          designerId: r.designerId ?? '',
          taskId: r.taskId ?? '',
          dayIndex: r.dayIndex ?? 0,
        }),
      );
    } catch (err) {
      this.fail('Scheduler assignments query failed', err);
    }
  }

  async getWeekMeta(weekStart: string): Promise<SchedulerWeekMetaDto> {
    const { weekStartDate } = this.parseWeekStart(weekStart);
    const row = await this.prisma.schedulerWeek.findUnique({ where: { weekStartDate } });
    return {
      weekStart,
      version: row?.version ?? 0,
      isLocked: Boolean(row?.isLocked ?? false),
      updatedAt: (row?.updatedAt ?? new Date(0)).toISOString(),
      updatedBy: row?.updatedBy ?? null,
    };
  }

  async setWeekLock(weekStart: string, userId: string, locked: boolean): Promise<SchedulerWeekMetaDto> {
    const { weekStartDate } = this.parseWeekStart(weekStart);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.schedulerWeek.findUnique({ where: { weekStartDate } });
      const row = existing
        ? await tx.schedulerWeek.update({
            where: { weekStartDate },
            data: { isLocked: locked, updatedBy: userId },
          })
        : await tx.schedulerWeek.create({
            data: { weekStartDate, version: 0, isLocked: locked, updatedBy: userId },
          });

      return row;
    });

    await this.activityLogger.log({
      action: locked ? ActivityAction.SCHEDULER_WEEK_LOCKED : ActivityAction.SCHEDULER_WEEK_UNLOCKED,
      userId,
      details: {
        event: locked ? ActivityAction.SCHEDULER_WEEK_LOCKED : ActivityAction.SCHEDULER_WEEK_UNLOCKED,
        messageKey: locked ? 'scheduler_week_locked' : 'scheduler_week_unlocked',
        context: { weekStart, isLocked: locked },
      },
    });

    return {
      weekStart,
      version: result.version,
      isLocked: Boolean(result.isLocked),
      updatedAt: result.updatedAt.toISOString(),
      updatedBy: result.updatedBy ?? null,
    };
  }

  async saveWeekSnapshot(weekStart: string, userId: string, dto: SaveSchedulerWeekDto) {
    const { weekStartDate, weekEndDate } = this.parseWeekStart(weekStart);
    this.validateAssignments(dto);
    const payloadHash = this.stablePayloadHash(dto.assignments);

    const result = await this.prisma.$transaction(async (tx) => {
      const designerIds = Array.from(new Set(dto.assignments.map((a) => a.designerId)));
      const taskIds = Array.from(new Set(dto.assignments.map((a) => a.taskId)));

      const [designers, tasks, previousRows, weekRows] = await Promise.all([
        tx.user.findMany({
          where: { id: { in: designerIds }, role: { name: UserRole.DESIGNER } },
          select: { id: true },
        }),
        tx.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, status: true, assigneeId: true } }),
        tx.schedulerAssignment.findMany({ where: { weekStartDate } }),
        // UPDLOCK + ROWLOCK: prevents two concurrent transactions from both passing the
        // version check before either commits, which would cause a silent lost update.
        tx.$queryRaw<Array<{
          id: string;
          version: number;
          isLocked: boolean;
          lastPayloadHash: string | null;
          updatedAt: Date;
          updatedBy: string | null;
        }>>`SELECT id, version, isLocked, lastPayloadHash, updatedAt, updatedBy
            FROM ErpTSSchedulerWeek WITH (UPDLOCK, ROWLOCK)
            WHERE weekStartDate = ${weekStartDate}`,
      ]);
      const week = weekRows[0] ?? null;

      if (designers.length !== designerIds.length) {
        throw new BadRequestException('One or more designerId values are invalid or not DESIGNER role.');
      }
      if (tasks.length !== taskIds.length) {
        throw new BadRequestException('One or more taskId values are invalid.');
      }

      const existing = week ??
        (await tx.schedulerWeek.create({
          data: {
            weekStartDate,
            version: 0,
            isLocked: false,
            updatedBy: userId,
          },
        }));

      if (existing.isLocked) {
        throw new ForbiddenException('This scheduler week is locked.');
      }
      if (dto.version !== existing.version) {
        throw new ConflictException('Scheduler week has changed. Refresh and retry.');
      }

      if (existing.lastPayloadHash && existing.lastPayloadHash === payloadHash) {
        return {
          version: existing.version,
          changed: false,
          assignments: previousRows,
          isLocked: Boolean(existing.isLocked),
          updatedAt: existing.updatedAt,
          updatedBy: existing.updatedBy,
        };
      }

      await tx.schedulerAssignment.deleteMany({ where: { weekStartDate } });

      if (dto.assignments.length > 0) {
        await tx.schedulerAssignment.createMany({
          data: dto.assignments.map((a) => ({
            designerId: a.designerId,
            taskId: a.taskId,
            dayIndex: a.dayIndex,
            assignedHours: new Prisma.Decimal(a.assignedHours),
            parentId: a.parentId ?? null,
            splitIndex: a.splitIndex ?? null,
            totalParts: a.totalParts ?? null,
            weekStartDate,
            weekEndDate,
            notes: a.notes ?? null,
            isLocked: false,
            assignedBy: userId,
          })),
        });
      }

      const prevTaskIds = Array.from(new Set(previousRows.map((r: any) => r.taskId).filter(Boolean))) as string[];
      const affectedTaskIds = Array.from(new Set([...prevTaskIds, ...taskIds]));

      const assigneesByTask = new Map<string, Set<string>>();
      for (const row of dto.assignments) {
        if (!assigneesByTask.has(row.taskId)) assigneesByTask.set(row.taskId, new Set());
        assigneesByTask.get(row.taskId)?.add(row.designerId);
      }

      const reassignedTasks: Array<{ taskId: string; oldAssigneeId: string | null; newAssigneeId: string }> = [];

      if (affectedTaskIds.length > 0) {
        const affectedTasks = await tx.task.findMany({
          where: { id: { in: affectedTaskIds } },
          select: { id: true, status: true, assigneeId: true },
        });

        for (const task of affectedTasks) {
          const designerSet = assigneesByTask.get(task.id) ?? new Set<string>();
          const assignedDesigner = designerSet.size === 1 ? [...designerSet][0] : null;

          const currentStatus = String(task.status ?? '').toUpperCase();
          const isTerminal = ['COMPLETED', 'APPROVED', 'REVIEW_COMPLETED', 'CLIENT_REJECTED'].includes(currentStatus);

          const updateData: Prisma.TaskUncheckedUpdateInput = {};
          if (assignedDesigner) {
            updateData.assigneeId = assignedDesigner;
            // Promote DESIGN_NEW → DESIGN_PLANNED when given a scheduler slot; leave all other active statuses untouched.
            if (!isTerminal && currentStatus === 'DESIGN_NEW') {
              updateData.status = 'DESIGN_PLANNED';
            }
          } else if (designerSet.size === 0) {
            updateData.assigneeId = null;
            // When unassigned, revert to DESIGN_NEW unless terminal or on hold.
            if (!isTerminal && currentStatus !== 'ON_HOLD') {
              updateData.status = 'DESIGN_NEW';
            }
          }

          if (Object.keys(updateData).length > 0) {
            await tx.task.update({ where: { id: task.id }, data: updateData });
          }

          if (assignedDesigner && assignedDesigner !== task.assigneeId) {
            reassignedTasks.push({ taskId: task.id, oldAssigneeId: task.assigneeId ?? null, newAssigneeId: assignedDesigner });
          }
        }
      }

      const nextVersion = existing.version + 1;
      const updatedWeek = await tx.schedulerWeek.update({
        where: { weekStartDate },
        data: {
          version: nextVersion,
          updatedBy: userId,
          lastPayloadHash: payloadHash,
        },
      });

      await tx.schedulerAssignmentHistory.create({
        data: {
          weekStartDate,
          versionFrom: existing.version,
          versionTo: nextVersion,
          changedBy: userId,
          beforeJson: JSON.stringify(previousRows),
          afterJson: JSON.stringify(dto.assignments),
        },
      });

      const newRows = await tx.schedulerAssignment.findMany({
        where: { weekStartDate },
        orderBy: [{ designerId: 'asc' }, { dayIndex: 'asc' }, { id: 'asc' }],
      });

      return {
        version: updatedWeek.version,
        changed: true,
        assignments: newRows,
        isLocked: Boolean(updatedWeek.isLocked),
        updatedAt: updatedWeek.updatedAt,
        updatedBy: updatedWeek.updatedBy,
        reassignedTasks,
      };
    });

    this.logger.debug(`[SCHED-NOTIFY] changed=${result.changed} reassignedCount=${result.reassignedTasks?.length ?? 0}`);
    if (result.changed && result.reassignedTasks?.length) {
      const allDesignerIds = Array.from(new Set([
        ...result.reassignedTasks.map((r) => r.newAssigneeId),
        ...result.reassignedTasks.map((r) => r.oldAssigneeId).filter(Boolean) as string[],
      ]));
      const designers = await this.prisma.user.findMany({
        where: { id: { in: allDesignerIds } },
        select: { id: true, fullName: true },
      });
      const nameById = new Map(designers.map((d) => [d.id, d.fullName]));

      const taskIds = Array.from(new Set(result.reassignedTasks.map((r) => r.taskId)));
      const taskDetails = await this.prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, taskNo: true, title: true },
      });
      const taskById = new Map(taskDetails.map((t) => [t.id, t]));

      await Promise.all(
        result.reassignedTasks.map((r) =>
          this.activityLogger.log({
            action: ActivityAction.ASSIGNED_TASK,
            userId,
            taskId: r.taskId,
            details: {
              event: ActivityAction.ASSIGNED_TASK,
              messageKey: 'task_assigned',
              taskSnapshot: {
                id: r.taskId,
                taskNo: taskById.get(r.taskId)?.taskNo,
                title: taskById.get(r.taskId)?.title ?? undefined,
              },
              changes: {
                newAssigneeId: r.newAssigneeId,
                newAssigneeName: nameById.get(r.newAssigneeId) ?? 'Unknown',
                oldAssigneeId: r.oldAssigneeId,
                oldAssigneeName: r.oldAssigneeId ? (nameById.get(r.oldAssigneeId) ?? null) : null,
                source: 'scheduler',
              },
            },
          }),
        ),
      );

      // Notify each newly assigned designer + all HODs
      const hodUsers = await this.prisma.user.findMany({
        where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
        select: { id: true },
      });
      for (const r of result.reassignedTasks) {
        const task = taskById.get(r.taskId);
        if (!task) continue;
        const taskLink = `/project-task-view/${r.taskId}`;
        const designerName = nameById.get(r.newAssigneeId) ?? 'Designer';
        const designerMsg = `${task.taskNo} has been scheduled for you.`;
        const hodMsg = `${task.taskNo} scheduled and assigned to ${designerName}.`;
        this.notificationsService
          .create({ userId: r.newAssigneeId, title: 'Task Scheduled for You', message: designerMsg, linkUrl: taskLink })
          .catch((err) => this.logger.error('Failed to notify designer on scheduler assign', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(r.newAssigneeId);
        for (const hod of hodUsers) {
          if (hod.id !== r.newAssigneeId) {
            this.notificationsService
              .create({ userId: hod.id, title: 'Task Scheduled', message: hodMsg, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify HOD on scheduler assign', err));
            this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
          }
        }
      }
    }

    if (result.changed) {
      await this.activityLogger.log({
        action: ActivityAction.SCHEDULER_WEEK_SAVED,
        userId,
        details: {
          event: ActivityAction.SCHEDULER_WEEK_SAVED,
          messageKey: 'scheduler_week_saved',
          context: {
            weekStart,
            version: result.version,
            assignmentsCount: result.assignments.length,
            weekdayCapacityHours: DAILY_CAPACITY,
            overtimeCapHours: MAX_DAILY_HOURS,
          },
        },
      });
    }

    return {
      weekStart,
      version: result.version,
      isLocked: result.isLocked,
      updatedAt: result.updatedAt.toISOString(),
      updatedBy: result.updatedBy ?? null,
      assignments: result.assignments.map((r: any) =>
        this.mapRow({
          ...(r as unknown as RawAssignmentRow),
          designerId: r.designerId ?? '',
          taskId: r.taskId ?? '',
          dayIndex: r.dayIndex ?? 0,
        }),
      ),
    };
  }
}
