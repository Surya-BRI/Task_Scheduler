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
  scheduledHours?: string | number | null;
  approvedOvertimeHours?: string | number | null;
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
  scheduledHours: number;
  approvedOvertimeHours: number;
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

  private toHours(value: unknown): number {
    if (value == null) return 0;
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
    return Number.isFinite(n) ? n : 0;
  }

  private toBool(value: boolean | number | null | undefined): boolean {
    if (value === true || value === 1) return true;
    return false;
  }

  private dayIndexForDate(date: Date, weekStartDate: Date): number {
    const dateUtc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const weekUtc = Date.UTC(
      weekStartDate.getUTCFullYear(),
      weekStartDate.getUTCMonth(),
      weekStartDate.getUTCDate(),
    );
    return Math.floor((dateUtc - weekUtc) / 86_400_000);
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
    const assignedHours = this.toHours(row.assignedHours);
    const scheduledHours = row.scheduledHours == null ? assignedHours : this.toHours(row.scheduledHours);
    const approvedOvertimeHours = this.toHours(row.approvedOvertimeHours);
    return {
      id: row.id,
      designerId: String(row.designerId ?? '').trim(),
      taskId: String(row.taskId ?? '').trim(),
      dayIndex: Number(row.dayIndex),
      assignedHours,
      scheduledHours,
      approvedOvertimeHours,
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

      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
      const approvedRequests = await this.prisma.overtimeRequest.findMany({
        where: {
          status: 'APPROVED',
          date: { gte: weekStartDate, lte: weekEndDate },
          ...(designerId ? { designerId } : {}),
        },
        select: {
          id: true,
          designerId: true,
          taskId: true,
          date: true,
          approvedHours: true,
        },
        orderBy: { approvedAt: 'asc' },
      });

      const approvedByAssignmentKey = new Map<string, number>();
      for (const request of approvedRequests) {
        if (!request.designerId || !request.taskId || !request.date) continue;
        const dayIndex = this.dayIndexForDate(new Date(request.date), weekStartDate);
        if (dayIndex < 0 || dayIndex > 6) continue;
        const hours = this.toHours(request.approvedHours);
        if (!hours) continue;
        const key = `${request.designerId}|${request.taskId}|${dayIndex}`;
        approvedByAssignmentKey.set(key, (approvedByAssignmentKey.get(key) ?? 0) + hours);
      }

      const mappedRows = rows.map((r) => {
        const designerKey = r.designerId ?? '';
        const taskKey = r.taskId ?? '';
        const dayKey = r.dayIndex ?? 0;
        const overtimeKey = `${designerKey}|${taskKey}|${dayKey}`;
        const approvedOvertimeHours = approvedByAssignmentKey.get(overtimeKey) ?? 0;
        approvedByAssignmentKey.delete(overtimeKey);
        const scheduledHours = this.toHours(r.assignedHours);
        return this.mapRow({
          ...(r as unknown as RawAssignmentRow),
          designerId: designerKey,
          taskId: taskKey,
          dayIndex: dayKey,
          scheduledHours,
          approvedOvertimeHours,
          assignedHours: scheduledHours + approvedOvertimeHours,
        });
      });

      const virtualRows = approvedRequests
        .map((request) => {
          if (!request.designerId || !request.taskId || !request.date) return null;
          const dayIndex = this.dayIndexForDate(new Date(request.date), weekStartDate);
          if (dayIndex < 0 || dayIndex > 6) return null;
          const key = `${request.designerId}|${request.taskId}|${dayIndex}`;
          const approvedOvertimeHours = approvedByAssignmentKey.get(key) ?? 0;
          if (!approvedOvertimeHours) return null;
          approvedByAssignmentKey.delete(key);
          return this.mapRow({
            id: `overtime-${request.id}`,
            designerId: request.designerId,
            taskId: request.taskId,
            dayIndex,
            assignedHours: approvedOvertimeHours,
            scheduledHours: 0,
            approvedOvertimeHours,
            parentId: null,
            splitIndex: null,
            totalParts: null,
            weekStartDate,
            weekEndDate,
            notes: 'Approved overtime',
            isLocked: true,
            assignedBy: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        })
        .filter((row): row is SchedulerAssignmentDto => row != null);

      return [...mappedRows, ...virtualRows];
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
    }, { timeout: 15_000 });

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

  async clearTaskSchedule(taskId: string): Promise<void> {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    await this.prisma.schedulerAssignment.deleteMany({
      where: { taskId, weekStartDate: { gte: todayMidnight } },
    });
  }

  async saveWeekSnapshot(weekStart: string, userId: string, dto: SaveSchedulerWeekDto) {
    const { weekStartDate, weekEndDate } = this.parseWeekStart(weekStart);
    this.validateAssignments(dto);
    const payloadHash = this.stablePayloadHash(dto.assignments);

    const result = await this.prisma.$transaction(async (tx) => {
      const designerIds = Array.from(new Set(dto.assignments.map((a) => a.designerId)));
      const taskIds = Array.from(new Set(dto.assignments.map((a) => a.taskId)));

      const [schedulableUsers, tasks, previousRows, weekRows] = await Promise.all([
        tx.user.findMany({
          where: { id: { in: designerIds }, role: { name: { in: [UserRole.DESIGNER, UserRole.HOD] } } },
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

      if (schedulableUsers.length !== designerIds.length) {
        throw new BadRequestException('One or more designerId values are invalid or not schedulable employee role.');
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

      // --- Cross-week sequential split index recomputation ---
      // If any assignments carry split metadata, recompute splitIndex/totalParts globally
      // so that parts in other weeks are numbered sequentially (e.g. week1=1,2 + week2=3).
      const splitTaskIds = Array.from(new Set(
        dto.assignments
          .filter(a => a.splitIndex != null || a.parentId != null)
          .map(a => a.taskId),
      ));

      const otherWeekUpdates: Array<{ id: string; splitIndex: number; totalParts: number }> = [];

      if (splitTaskIds.length > 0) {
        const crossWeekRows = await tx.schedulerAssignment.findMany({
          where: {
            taskId: { in: splitTaskIds },
            weekStartDate: { not: weekStartDate },
          },
          select: { id: true, taskId: true, dayIndex: true, weekStartDate: true, splitIndex: true, totalParts: true },
          orderBy: [{ weekStartDate: 'asc' }, { dayIndex: 'asc' }],
        });

        const currentWeekMs = weekStartDate.getTime();

        for (const taskId of splitTaskIds) {
          const currentParts = dto.assignments
            .filter(a => a.taskId === taskId)
            .sort((a, b) => a.dayIndex - b.dayIndex);

          if (currentParts.length === 0) continue;

          const otherRows = (crossWeekRows as any[])
            .filter(r => r.taskId === taskId)
            .sort((a, b) => {
              const wDiff = new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime();
              return wDiff !== 0 ? wDiff : a.dayIndex - b.dayIndex;
            });

          // Single part with no cross-week peers — skip, no global label needed
          if (otherRows.length === 0 && currentParts.length <= 1) continue;

          const beforeCurrent = otherRows.filter(r => new Date(r.weekStartDate).getTime() < currentWeekMs);
          const afterCurrent = otherRows.filter(r => new Date(r.weekStartDate).getTime() > currentWeekMs);

          // All parts in global chronological order: earlier weeks → current week → later weeks
          const allParts: Array<
            | { source: 'other'; row: (typeof crossWeekRows)[0] }
            | { source: 'current'; assignment: (typeof dto.assignments)[0] }
          > = [
            ...beforeCurrent.map(r => ({ source: 'other' as const, row: r as any })),
            ...currentParts.map(a => ({ source: 'current' as const, assignment: a })),
            ...afterCurrent.map(r => ({ source: 'other' as const, row: r as any })),
          ];

          const totalParts = allParts.length;

          allParts.forEach((part, idx) => {
            const newSplitIndex = idx + 1;
            if (part.source === 'current') {
              part.assignment.splitIndex = newSplitIndex;
              part.assignment.totalParts = totalParts;
              if (!part.assignment.parentId) part.assignment.parentId = taskId;
            } else {
              if (part.row.splitIndex !== newSplitIndex || part.row.totalParts !== totalParts) {
                otherWeekUpdates.push({ id: part.row.id as string, splitIndex: newSplitIndex, totalParts });
              }
            }
          });
        }
      }
      // --- End cross-week recomputation ---

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

      // Propagate corrected splitIndex/totalParts to other weeks' rows
      for (const upd of otherWeekUpdates) {
        await tx.schedulerAssignment.update({
          where: { id: upd.id },
          data: { splitIndex: upd.splitIndex, totalParts: upd.totalParts },
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
      const splitTasks: Array<{ taskId: string; designerIds: string[] }> = [];

      const assignOnlyByDesigner = new Map<string, string[]>();
      const assignPlannedByDesigner = new Map<string, string[]>();
      const unassignOnlyIds: string[] = [];
      const unassignNewIds: string[] = [];
      const splitNullIds: string[] = [];

      if (affectedTaskIds.length > 0) {
        const affectedTasks = await tx.task.findMany({
          where: { id: { in: affectedTaskIds } },
          select: { id: true, status: true, assigneeId: true },
        });

        const pushGroupedTask = (map: Map<string, string[]>, key: string, taskId: string) => {
          const ids = map.get(key) ?? [];
          ids.push(taskId);
          map.set(key, ids);
        };

        for (const task of affectedTasks) {
          const designerSet = assigneesByTask.get(task.id) ?? new Set<string>();
          const assignedDesigner = designerSet.size === 1 ? [...designerSet][0] : null;

          const currentStatus = String(task.status ?? '').toUpperCase();
          const isTerminal = ['COMPLETED', 'APPROVED', 'CLIENT_ACCEPTED', 'CLIENT_REJECTED'].includes(currentStatus);

          if (assignedDesigner) {
            // Promote DESIGN_NEW → DESIGN_PLANNED when given a scheduler slot; leave all other active statuses untouched.
            const shouldPlan = !isTerminal && currentStatus === 'DESIGN_NEW';
            if (shouldPlan) {
              pushGroupedTask(assignPlannedByDesigner, assignedDesigner, task.id);
            } else if (task.assigneeId !== assignedDesigner) {
              pushGroupedTask(assignOnlyByDesigner, assignedDesigner, task.id);
            }
          } else if (designerSet.size === 0) {
            // When unassigned, revert to DESIGN_NEW unless terminal or on hold.
            if (!isTerminal && currentStatus !== 'ON_HOLD') {
              unassignNewIds.push(task.id);
            } else if (task.assigneeId !== null) {
              unassignOnlyIds.push(task.id);
            }
          } else {
            // Split across multiple designers — null out assigneeId so the task
            // doesn't falsely appear assigned to only one person.
            splitNullIds.push(task.id);
          }

          if (assignedDesigner && assignedDesigner !== task.assigneeId) {
            reassignedTasks.push({ taskId: task.id, oldAssigneeId: task.assigneeId ?? null, newAssigneeId: assignedDesigner });
          }
          if (designerSet.size > 1) {
            splitTasks.push({ taskId: task.id, designerIds: [...designerSet] });
          }
        }
      }

      // Sync ErpTSTaskDesigner junction: reflects all designers assigned to each task this week.
      if (affectedTaskIds.length > 0) {
        await tx.taskDesigner.deleteMany({ where: { taskId: { in: affectedTaskIds } } });
        const junctionRows: { taskId: string; designerId: string }[] = [];
        for (const [taskId, designerSet] of assigneesByTask.entries()) {
          for (const designerId of designerSet) {
            junctionRows.push({ taskId, designerId });
          }
        }
        if (junctionRows.length > 0) {
          await tx.taskDesigner.createMany({ data: junctionRows });
        }

        const nullAssigneeIds = [...unassignOnlyIds, ...splitNullIds];
        await Promise.all([
          ...[...assignPlannedByDesigner.entries()].map(([assigneeId, ids]) =>
            tx.task.updateMany({ where: { id: { in: ids } }, data: { assigneeId, status: 'DESIGN_PLANNED' } }),
          ),
          ...[...assignOnlyByDesigner.entries()].map(([assigneeId, ids]) =>
            tx.task.updateMany({ where: { id: { in: ids } }, data: { assigneeId } }),
          ),
          unassignNewIds.length > 0
            ? tx.task.updateMany({ where: { id: { in: unassignNewIds } }, data: { assigneeId: null, status: 'DESIGN_NEW' } })
            : Promise.resolve(),
          nullAssigneeIds.length > 0
            ? tx.task.updateMany({ where: { id: { in: nullAssigneeIds } }, data: { assigneeId: null } })
            : Promise.resolve(),
        ]);
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
        splitTasks,
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

      // Notify each designer individually for split tasks (assigneeId = null, multiple designers)
      if (result.splitTasks?.length) {
        const splitTaskIds = result.splitTasks.map((s) => s.taskId);
        const splitDesignerIds = Array.from(new Set(result.splitTasks.flatMap((s) => s.designerIds)));
        const [splitTaskDetails, splitDesigners] = await Promise.all([
          this.prisma.task.findMany({ where: { id: { in: splitTaskIds } }, select: { id: true, taskNo: true } }),
          this.prisma.user.findMany({ where: { id: { in: splitDesignerIds } }, select: { id: true, fullName: true } }),
        ]);
        const splitTaskById = new Map(splitTaskDetails.map((t) => [t.id, t]));
        const splitNameById = new Map(splitDesigners.map((d) => [d.id, d.fullName]));

        for (const { taskId, designerIds } of result.splitTasks) {
          const task = splitTaskById.get(taskId);
          if (!task) continue;
          const taskLink = `/project-task-view/${taskId}`;
          const designerNames = designerIds.map((id) => splitNameById.get(id) ?? 'Designer').join(', ');
          for (const designerId of designerIds) {
            this.notificationsService
              .create({ userId: designerId, title: 'Task Scheduled for You', message: `${task.taskNo} has been scheduled for you.`, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify split designer on scheduler save', err));
            this.dashboardRealtime?.notifyUserNotificationRefresh(designerId);
          }
          for (const hod of hodUsers) {
            this.notificationsService
              .create({ userId: hod.id, title: 'Task Scheduled', message: `${task.taskNo} split across: ${designerNames}.`, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify HOD on split task', err));
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
