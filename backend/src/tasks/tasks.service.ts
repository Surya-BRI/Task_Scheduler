import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UserRole } from '../common/constants/roles.enum';
import { CreateExtendedTaskDto } from './dto/create-extended-task.dto';
import { TaskFilesService } from './task-files.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';
import { SaveSignRowsDto } from './dto/save-sign-rows.dto';
import { SubmitWorkDto } from './dto/submit-work.dto';
import { SaveTimerStateDto } from './dto/save-timer-state.dto';
import { QsStatusValue, UpdateQsStatusDto } from './dto/update-qs-status.dto';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';
import { COMPLETED_STATUS_FILTER } from '../dashboard/task-status-buckets.util';
import { NotificationsService } from '../notifications/notifications.service';

const TASK_SELECT = {
  id: true,
  taskNo: true,
  opNo: true,
  title: true,
  revisionCode: true,
  designType: true,
  signType: true,
  signFamily: true,
  disciplineType: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  holdPreviousStatus: true,
  reworkNote: true,
  reworkAttachmentUrl: true,
  reworkAttachmentName: true,
  reworkLinkUrl: true,
  reworkLinkName: true,
  previousRevisionTaskId: true,
  technicalHead: true,
  teamLead: true,
  subTeamLead: true,
  designers: true,
  projectId: true,
  project: { select: { id: true, name: true, projectNo: true, category: true } },
  assigneeId: true,
  assignee: { select: { id: true, fullName: true, email: true } },
  taskDesigners: { select: { designer: { select: { id: true, fullName: true, email: true } } } },
  retailDetails: {
    select: {
      id: true,
      taskId: true,
      providedFile: true,
      hodName: true,
      designTypes: true,
      hoursRequired: true,
      comment: true,
      signFamily: true,
      signType: true,
      planCode: true,
      contractRef: true,
      quantity: true,
      deadline: true,
      createdAt: true,
      attachments: {
        select: {
          id: true,
          fileKey: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      },
    },
  },
  projectDetails: {
    select: {
      id: true,
      taskId: true,
      signType: true,
      planCode: true,
      area: true,
      level: true,
      artwork: true,
      artworkHours: true,
      technical: true,
      technicalHours: true,
      location: true,
      locationHours: true,
      asBuilt: true,
      asBuiltHours: true,
      bim: true,
      deadline: true,
      comment: true,
      createdAt: true,
      attachments: {
        select: {
          id: true,
          fileKey: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
      },
    },
  },
  createdAt: true,
  updatedAt: true,
};

const TASK_LIST_SELECT = {
  id: true,
  taskNo: true,
  opNo: true,
  title: true,
  revisionCode: true,
  designType: true,
  signType: true,
  signFamily: true,
  disciplineType: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  holdPreviousStatus: true,
  reworkNote: true,
  reworkAttachmentUrl: true,
  reworkAttachmentName: true,
  reworkLinkUrl: true,
  reworkLinkName: true,
  previousRevisionTaskId: true,
  projectId: true,
  project: { select: { id: true, name: true, projectNo: true, category: true, salesPerson: true } },
  assigneeId: true,
  assignee: { select: { id: true, fullName: true, email: true } },
  taskDesigners: { select: { designer: { select: { id: true, fullName: true, email: true } } } },
  retailDetails: { select: { hoursRequired: true } },
  projectDetails: { select: { artworkHours: true, technicalHours: true, locationHours: true, asBuiltHours: true } },
  createdAt: true,
  updatedAt: true,
};

const QS_STATUS_PENDING: QsStatusValue = 'Pending';
const QS_STATUS_IN_PROGRESS: QsStatusValue = 'In Progress';
const QS_STATUS_COMPLETED: QsStatusValue = 'Completed';
const QS_STATUS_VALUES = new Set<string>([QS_STATUS_PENDING, QS_STATUS_IN_PROGRESS, QS_STATUS_COMPLETED]);

const SIGN_ROW_REQUIRED_FIELDS = [
  ['tNo', 'T.No'],
  ['no', 'No'],
  ['signType', 'Sign Type'],
  ['planCode', 'Plan Code'],
  ['estQty', 'Est QTY'],
  ['qsQty', 'QS QTY'],
  ['areaZone', 'Area/Zone'],
  ['levelParcel', 'Level/Parcel'],
  ['sequence', 'Sequence'],
  ['status', 'Status'],
  ['contRef', 'Cont.Ref'],
] as const;

export type TaskFilters = {
  projectId?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

export type NextRevisionQuery = {
  projectId?: string;
  projectNo?: string;
  opNo?: string;
  designType?: string;
};

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskFilesService: TaskFilesService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  private toDbTaskStatus(status?: string | null) {
    const value = String(status ?? '').trim().toUpperCase();
    if (value === 'PENDING') return 'DESIGN_NEW';
    if (value === 'WIP') return 'IN_PROGRESS';
    return value;
  }

  private toApiTaskStatus(status?: string | null) {
    const value = String(status ?? '').trim().toUpperCase();
    if (!value) return value;
    if (value === 'ON-HOLD') return 'ON_HOLD';
    if (value === 'PENDING') return 'DESIGN_NEW';
    if (value === 'WIP') return 'IN_PROGRESS';
    return value;
  }

  private normalizeTaskForApi<T extends { status?: string | null }>(task: T): T {
    return {
      ...task,
      status: this.toApiTaskStatus(task.status),
    };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value ?? '').trim(),
    );
  }

  private isAbsoluteHttpUrl(value: string) {
    return /^https?:\/\//i.test(String(value ?? '').trim());
  }

  private async withSignedAttachmentUrls<T extends { retailDetails?: any[]; projectDetails?: any[] }>(task: T): Promise<T> {
    const allKeys = [
      ...(task.retailDetails ?? []).flatMap((line) => (line.attachments ?? []).map((a: any) => a.fileKey)),
      ...(task.projectDetails ?? []).flatMap((line) => (line.attachments ?? []).map((a: any) => a.fileKey)),
    ].filter(Boolean);
    const uniqueKeys = Array.from(new Set(allKeys));
    const signedMap = new Map<string, string>();
    await Promise.all(
      uniqueKeys.map(async (key) => {
        const signedUrl = this.isAbsoluteHttpUrl(key)
          ? key
          : await this.taskFilesService.createSignedReadUrl(key);
        signedMap.set(key, signedUrl);
      }),
    );

    return {
      ...task,
      retailDetails: (task.retailDetails ?? []).map((line: any) => ({
        ...line,
        attachments: (line.attachments ?? []).map((a: any) => ({
          ...a,
          sizeBytes: typeof a.sizeBytes === 'bigint' ? Number(a.sizeBytes) : a.sizeBytes,
          signedUrl: signedMap.get(a.fileKey) ?? null,
        })),
      })),
      projectDetails: (task.projectDetails ?? []).map((line: any) => ({
        ...line,
        attachments: (line.attachments ?? []).map((a: any) => ({
          ...a,
          sizeBytes: typeof a.sizeBytes === 'bigint' ? Number(a.sizeBytes) : a.sizeBytes,
          signedUrl: signedMap.get(a.fileKey) ?? null,
        })),
      })),
    };
  }

  private buildTaskNo(opNo?: string) {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const rand = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, '0');
    const cleanedOp = (opNo ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(-8);
    return cleanedOp ? `TSK-${cleanedOp}-${stamp}-${rand}` : `TSK-${stamp}-${rand}`;
  }

  private normalizeDesignType(value?: string | null): string {
    const raw = String(value ?? '').trim().toUpperCase();
    if (raw === 'ESTIMATION PURPOSE' || raw === 'ESTIMATION_PURPOSE') return 'ESTIMATION_PURPOSE';
    if (raw === 'PRESENTATION') return 'PRESENTATION';
    if (raw === 'CLIENT SUBMISSION' || raw === 'CLIENT_SUBMISSION') return 'CLIENT_SUBMISSION';
    if (raw === 'TECHNICAL DRAWING' || raw === 'TECHNICAL_DRAWING') return 'TECHNICAL_DRAWING';
    if (raw === 'PROJECT') return 'PROJECT';
    if (!raw) return 'PROJECT';
    return raw.replace(/\s+/g, '_');
  }

  private normalizeRevisionCode(value?: string | null): string | null {
    const raw = String(value ?? '').trim().toUpperCase();
    if (!raw) return null;
    if (!/^R\d+$/.test(raw)) {
      throw new BadRequestException('revisionCode must match R<number> (R0, R1, R2...).');
    }
    return raw;
  }

  private getRevisionNumber(revisionCode: string): number {
    const m = /^R(\d+)$/.exec(revisionCode);
    return m ? Number.parseInt(m[1], 10) : -1;
  }

  private async resolveNextRevisionCode(
    tx: Prisma.TransactionClient,
    params: { projectId: string; opNo: string; designType: string; signType?: string | null },
  ): Promise<string> {
    const rows = await tx.task.findMany({
      where: {
        projectId: params.projectId,
        opNo: params.opNo,
        designType: params.designType,
        ...(params.signType ? { signType: params.signType } : {}),
        revisionCode: { not: null },
      },
      select: { revisionCode: true },
    });
    let max = -1;
    for (const row of rows) {
      if (!row.revisionCode) continue;
      const n = this.getRevisionNumber(row.revisionCode);
      if (n > max) max = n;
    }
    return `R${max + 1}`;
  }

  async getNextRevision(query: NextRevisionQuery) {
    const opNo = String(query.opNo ?? '').trim();
    if (!opNo) throw new BadRequestException('opNo is required');

    let projectId = String(query.projectId ?? '').trim();
    if (!projectId) {
      const project = await this.resolveProjectForCreate({ projectNo: query.projectNo, opNo });
      projectId = project.id;
    }
    const designType = this.normalizeDesignType(query.designType);
    const revisionCode = await this.resolveNextRevisionCode(this.prisma, { projectId, opNo, designType });
    return { projectId, opNo, designType, revisionCode };
  }

  private async resolveProjectForCreate(task: { projectId?: string; projectNo?: string; opNo?: string }) {
    const tryFindByProjectNo = async (raw: string | undefined) => {
      const value = (raw ?? '').trim();
      if (!value) return null;

      const exact = await this.prisma.project.findFirst({
        where: { projectNo: value },
      });
      if (exact) return exact;

      const normalized = value.toLowerCase().replace(/[\s-]/g, '');
      const candidates = await this.prisma.project.findMany({
        where: { projectNo: { not: null } },
        select: { id: true, projectNo: true, name: true, category: true, businessUnit: true, description: true, status: true, salesPerson: true, createdById: true, createdAt: true, updatedAt: true },
        take: 5000,
      });
      return (
        candidates.find(
          (p) =>
            (p.projectNo ?? '')
              .toLowerCase()
              .replace(/[\s-]/g, '') === normalized,
        ) ?? null
      );
    };

    const byProjectNo = await tryFindByProjectNo(task.projectNo);
    if (byProjectNo) return byProjectNo;

    const byOpNoAsProjectNo = await tryFindByProjectNo(task.opNo);
    if (byOpNoAsProjectNo) return byOpNoAsProjectNo;

    throw new NotFoundException('Project not found (reuse existing projectNo or OP no)');
  }

  private async resolveOrCreateProjectForExtended(
    task: {
      projectNo?: string;
      opNo?: string;
      title?: string;
      description?: string;
      projectName?: string;
      businessUnit?: string;
    },
    designType: 'Retail' | 'Project',
  ) {
    const requestedName = (task.projectName ?? '').trim();
    if (!requestedName) {
      throw new BadRequestException('projectName is required when creating task from project context');
    }

    const existing = await this.resolveProjectForCreate(task).catch(() => null);
    if (existing) {
      if (requestedName && requestedName !== (existing.name ?? '').trim()) {
        return this.prisma.project.update({
          where: { id: existing.id },
          data: { name: requestedName },
        });
      }
      return existing;
    }

    const projectNo = (task.projectNo ?? task.opNo ?? '').trim();
    if (!projectNo) {
      throw new BadRequestException('projectNo or opNo is required to create project in ERP-Dev');
    }

    const name = requestedName;
    const businessUnit = (task.businessUnit ?? designType).trim();
    const category = designType;

    return this.prisma.project.create({
      data: {
        projectNo,
        name,
        category,
        businessUnit,
        description: task.description?.trim() || null,
        status: 'ACTIVE',
        salesPerson: null,
      },
    });
  }

  async create(userId: string, dto: CreateTaskDto) {
    const project = await this.resolveProjectForCreate({
      projectNo: dto.projectNo,
      opNo: dto.opNo,
    });
    const normalizedOpNo = String(dto.opNo ?? '').trim();
    if (!normalizedOpNo) {
      throw new BadRequestException('opNo is required for revision-based task creation.');
    }
    const normalizedDesignType = this.normalizeDesignType(dto.designType);

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const requestedRevision = this.normalizeRevisionCode(dto.revisionCode);
          const revisionCode =
            requestedRevision ??
            (await this.resolveNextRevisionCode(tx, {
              projectId: project.id,
              opNo: normalizedOpNo,
              designType: normalizedDesignType,
            }));

          const duplicate = await tx.task.findFirst({
            where: {
              projectId: project.id,
              opNo: normalizedOpNo,
              designType: normalizedDesignType,
              revisionCode,
            },
            select: { id: true },
          });
          if (duplicate) {
            throw new BadRequestException(
              `Revision ${revisionCode} already exists for ${normalizedDesignType} in this project/opNo.`,
            );
          }

          return tx.task.create({
            data: {
              taskNo: this.buildTaskNo(dto.opNo),
              title: dto.title?.trim() || null,
              revisionCode,
              designType: normalizedDesignType,
              opNo: normalizedOpNo,
              description: dto.description,
              priority: dto.priority ?? 'Medium',
              dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
              projectId: project.id,
              assigneeId: dto.assigneeId ?? null,
            },
            select: TASK_SELECT,
          });
        });
        await this.activityLogger.log({
          action: ActivityAction.TASK_CREATED,
          userId,
          taskId: created.id,
          details: {
            event: ActivityAction.TASK_CREATED,
            messageKey: 'task_created',
            taskSnapshot: {
              id: created.id,
              taskNo: created.taskNo,
              opNo: created.opNo,
              title: created.title ?? undefined,
              status: created.status,
            },
            projectSnapshot: {
              id: created.project?.id,
              projectNo: created.project?.projectNo,
              name: created.project?.name,
            },
            context: { source: 'tasks.create' },
          },
        });
        return created;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < 4
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException('Failed to generate unique task number');
  }

  async createExtended(userId: string, dto: CreateExtendedTaskDto) {
    const hasRetail = (dto.retailDetails?.length ?? 0) > 0;
    const hasProject = (dto.projectDetails?.length ?? 0) > 0;
    const normalizedOpNo = String(dto.task.opNo ?? '').trim();
    if (!normalizedOpNo) {
      throw new BadRequestException('task.opNo is required for revision-based task creation.');
    }
    const normalizedDesignType = this.normalizeDesignType(dto.task.designType ?? dto.designType);

    if (hasRetail && hasProject) {
      throw new BadRequestException('Send either retailDetails or projectDetails, not both');
    }
    if (dto.designType === 'Retail' && hasProject) {
      throw new BadRequestException('designType Retail cannot include projectDetails');
    }
    if (dto.designType === 'Project' && hasRetail) {
      throw new BadRequestException('designType Project cannot include retailDetails');
    }

    const project = await this.resolveOrCreateProjectForExtended(dto.task, dto.designType);
    await this.assignProjectToQsTeam(project.id, userId, {
      name: project.name,
      projectNo: project.projectNo,
    });

    if (dto.task.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.task.assigneeId } });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }

    const fileKeysToCheck = [
      ...(dto.retailDetails ?? []).flatMap((line) => [
        ...(line.attachments ?? []).map((attachment) => attachment.fileKey),
        ...(line.fileKey ? [line.fileKey] : []),
      ]),
      ...(dto.projectDetails ?? []).flatMap((line) =>
        (line.attachments ?? []).map((attachment) => attachment.fileKey),
      ),
    ].filter((key) => key && !this.isAbsoluteHttpUrl(key));
    if (fileKeysToCheck.length > 0) {
      await this.taskFilesService.assertKeysExist(fileKeysToCheck);
    }

    // ── RETAIL PATH: unchanged — 1 task + N retail detail rows ─────────────
    if (dto.designType === 'Retail') {
      const created = await this.prisma.$transaction(async (tx) => {
        let taskId: string | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const requestedRevision = this.normalizeRevisionCode(dto.task.revisionCode);
            const revisionCode =
              requestedRevision ??
              (await this.resolveNextRevisionCode(tx, {
                projectId: project.id,
                opNo: normalizedOpNo,
                designType: normalizedDesignType,
              }));

            const duplicate = await tx.task.findFirst({
              where: {
                projectId: project.id,
                opNo: normalizedOpNo,
                designType: normalizedDesignType,
                revisionCode,
              },
              select: { id: true },
            });
            if (duplicate) {
              throw new BadRequestException(
                `Revision ${revisionCode} already exists for ${normalizedDesignType} in this project/opNo.`,
              );
            }

            const createdTask = await tx.task.create({
              data: {
                taskNo: this.buildTaskNo(dto.task.opNo),
                title: dto.task.title?.trim() || null,
                revisionCode,
                designType: normalizedDesignType,
                opNo: normalizedOpNo,
                description: dto.task.description,
                priority: dto.task.priority ?? 'Medium',
                dueDate: dto.task.dueDate ? new Date(dto.task.dueDate) : undefined,
                projectId: project.id,
                assigneeId: dto.task.assigneeId ?? null,
              },
              select: { id: true },
            });
            taskId = createdTask.id;
            break;
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002' &&
              attempt < 4
            ) {
              continue;
            }
            throw error;
          }
        }
        if (!taskId) throw new BadRequestException('Failed to generate unique task number');

        for (const line of dto.retailDetails ?? []) {
          const createdLine = await tx.retailTaskDetail.create({
            data: {
              taskId,
              providedFile: line.providedFile,
              fileUrl: line.fileUrl,
              hodName: line.hodName,
              designTypes: line.designTypes?.length ? line.designTypes[0] : null,
              hoursRequired: line.hoursRequired ?? null,
              comment: line.comment,
              signFamily: line.signFamily,
              signType: line.signType,
              planCode: line.planCode,
              contractRef: line.contractRef,
              quantity: line.quantity ?? null,
              deadline: line.deadline ? new Date(line.deadline) : null,
            },
            select: { id: true },
          });

          const attachments = [
            ...(line.attachments ?? []),
            ...(line.fileKey
              ? [
                  {
                    fileKey: line.fileKey,
                    fileName: line.providedFile ?? 'attachment',
                    mimeType: null,
                    size: undefined,
                  },
                ]
              : []),
          ];

          if (attachments.length > 0) {
            await tx.retailTaskDetailAttachment.createMany({
              data: attachments.map((attachment) => ({
                retailTaskDetailId: createdLine.id,
                fileKey: attachment.fileKey,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType ?? null,
                sizeBytes:
                  typeof attachment.size === 'number' ? Math.round(attachment.size) : null,
              })),
            });
          }
        }

        return tx.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
      });

      if (!created) throw new NotFoundException('Task not found after create');
      await this.activityLogger.log({
        action: ActivityAction.TASK_CREATED,
        userId,
        taskId: created.id,
        details: {
          event: ActivityAction.TASK_CREATED,
          messageKey: 'task_created',
          taskSnapshot: { id: created.id, taskNo: created.taskNo, opNo: created.opNo, title: created.title ?? undefined, status: created.status },
          projectSnapshot: { id: created.project?.id, projectNo: created.project?.projectNo, name: created.project?.name },
          context: { source: 'tasks.createExtended', designType: dto.designType },
        },
      });

      if (created.assigneeId) {
        const taskLink = `/retail-task-view/${created.id}`;
        const createMsg = `${created.taskNo} — ${created.project?.name ?? 'Unknown Project'} has been assigned to you.`;
        this.notificationsService
          .create({ userId: created.assigneeId, title: 'Task Assigned to You', message: createMsg, linkUrl: taskLink })
          .then(() => this.logger.debug(`[NOTIFY] task created — designer notified`))
          .catch((err) => this.logger.error('Failed to notify designer on task create', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(created.assigneeId);

        const hodUsers = await this.prisma.user.findMany({
          where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
          select: { id: true },
        });
        const hodMsg = `${created.taskNo} — ${created.project?.name ?? 'Unknown Project'} created and assigned to ${created.assignee?.fullName ?? 'a designer'}.`;
        for (const hod of hodUsers) {
          if (hod.id !== created.assigneeId) {
            this.notificationsService
              .create({ userId: hod.id, title: 'New Task Assigned', message: hodMsg, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify HOD on task create', err));
            this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
          }
        }
      }

      const withUrls = await this.withSignedAttachmentUrls(created);
      return { tasks: [this.normalizeTaskForApi(withUrls)], count: 1 };
    }

    // ── PROJECT PATH: one ErpTSTask per sign-type detail line ───────────────
    const createdTasks = await this.prisma.$transaction(async (tx) => {
      const results: any[] = [];

      for (const line of dto.projectDetails ?? []) {
        const lineSignType = line.signType ?? null;
        const lineSignFamily = line.signFamily?.trim() ?? null;
        const lineDiscipline = line.disciplineType?.trim() ?? null;
        let taskId: string | null = null;

        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const requestedRevision = this.normalizeRevisionCode(dto.task.revisionCode);
            const revisionCode =
              requestedRevision ??
              (await this.resolveNextRevisionCode(tx, {
                projectId: project.id,
                opNo: normalizedOpNo,
                designType: normalizedDesignType,
                signType: lineSignType,
              }));

            const duplicate = await tx.task.findFirst({
              where: {
                projectId: project.id,
                opNo: normalizedOpNo,
                designType: normalizedDesignType,
                revisionCode,
                signType: lineSignType,
                disciplineType: lineDiscipline,
              },
              select: { id: true },
            });
            if (duplicate) {
              const label = [lineSignType ?? normalizedDesignType, lineDiscipline].filter(Boolean).join(' — ');
              throw new BadRequestException(
                `Revision ${revisionCode} already exists for "${label}" in this project/opNo.`,
              );
            }

            const taskTitle = [normalizedOpNo, lineSignType, lineDiscipline, revisionCode].filter(Boolean).join(' - ') || dto.task.title?.trim() || null;
            const createdTask = await tx.task.create({
              data: {
                taskNo: this.buildTaskNo(dto.task.opNo),
                title: taskTitle,
                revisionCode,
                designType: normalizedDesignType,
                signType: lineSignType,
                signFamily: lineSignFamily,
                disciplineType: lineDiscipline,
                opNo: normalizedOpNo,
                description: dto.task.description,
                priority: dto.task.priority ?? 'Medium',
                dueDate: line.deadline ? new Date(line.deadline) : (dto.task.dueDate ? new Date(dto.task.dueDate) : undefined),
                projectId: project.id,
                assigneeId: dto.task.assigneeId ?? null,
              },
              select: { id: true },
            });
            taskId = createdTask.id;
            break;
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002' &&
              attempt < 4
            ) {
              continue;
            }
            throw error;
          }
        }
        if (!taskId) throw new BadRequestException('Failed to generate unique task number');

        const createdLine = await tx.projectTaskDetail.create({
          data: {
            taskId,
            signType: line.signType,
            planCode: line.planCode,
            area: line.area,
            level: line.level,
            artwork: line.artwork ?? false,
            artworkHours: line.artworkHours ?? null,
            technical: line.technical ?? false,
            technicalHours: line.technicalHours ?? null,
            location: line.location ?? false,
            locationHours: line.locationHours ?? null,
            asBuilt: line.asBuilt ?? false,
            asBuiltHours: line.asBuiltHours ?? null,
            bim: line.bim ?? false,
            deadline: line.deadline ? new Date(line.deadline) : null,
            comment: line.comment,
          },
          select: { id: true },
        });

        if ((line.attachments?.length ?? 0) > 0) {
          await tx.projectTaskDetailAttachment.createMany({
            data: (line.attachments ?? []).map((attachment) => ({
              projectTaskDetailId: createdLine.id,
              fileKey: attachment.fileKey,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType ?? null,
              sizeBytes:
                typeof attachment.size === 'number' ? Math.round(attachment.size) : null,
            })),
          });
        }

        const full = await tx.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
        results.push(full);
      }

      return results;
    });

    // Log activity + notify for each created task
    const hodUsers = createdTasks.some((t) => t?.assigneeId)
      ? await this.prisma.user.findMany({
          where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
          select: { id: true },
        })
      : [];

    for (const task of createdTasks) {
      if (!task) continue;
      await this.activityLogger.log({
        action: ActivityAction.TASK_CREATED,
        userId,
        taskId: task.id,
        details: {
          event: ActivityAction.TASK_CREATED,
          messageKey: 'task_created',
          taskSnapshot: { id: task.id, taskNo: task.taskNo, opNo: task.opNo, title: task.title ?? undefined, status: task.status },
          projectSnapshot: { id: task.project?.id, projectNo: task.project?.projectNo, name: task.project?.name },
          context: { source: 'tasks.createExtended', designType: dto.designType },
        },
      });

      if (task.assigneeId) {
        const taskLink = `/project-task-view/${task.id}`;
        const createMsg = `${task.taskNo} — ${task.project?.name ?? 'Unknown Project'} has been assigned to you.`;
        this.notificationsService
          .create({ userId: task.assigneeId, title: 'Task Assigned to You', message: createMsg, linkUrl: taskLink })
          .catch((err) => this.logger.error('Failed to notify designer on task create', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(task.assigneeId);

        const hodMsg = `${task.taskNo} — ${task.project?.name ?? 'Unknown Project'} created and assigned to ${task.assignee?.fullName ?? 'a designer'}.`;
        for (const hod of hodUsers) {
          if (hod.id !== task.assigneeId) {
            this.notificationsService
              .create({ userId: hod.id, title: 'New Task Assigned', message: hodMsg, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify HOD on task create', err));
            this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
          }
        }
      }
    }

    const normalized = await Promise.all(
      createdTasks
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .map(async (t) => {
          const withUrls = await this.withSignedAttachmentUrls(t);
          return this.normalizeTaskForApi(withUrls);
        }),
    );
    return { tasks: normalized, count: normalized.length };
  }

  async uploadTaskFile(file: Express.Multer.File, userId: string) {
    const uploaded = await this.taskFilesService.uploadTaskFile(file, userId);
    await this.activityLogger.log({
      action: ActivityAction.TASK_FILE_UPLOADED,
      userId,
      taskId: null,
      details: {
        event: ActivityAction.TASK_FILE_UPLOADED,
        messageKey: 'task_file_uploaded',
        fileMeta: {
          fileName: uploaded.fileName,
          fileKey: uploaded.key,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.size,
        },
        context: { source: 'tasks.upload-file' },
      },
    });
    return uploaded;
  }

  async findAll(userId: string, role: UserRole, filters: TaskFilters = {}) {
    const { projectId, status, priority, assigneeId, search, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    // Role-based base filters
    const baseWhere: Record<string, unknown> = role === UserRole.SALESPERSON ? { status: 'SALES_REVIEW' } : {};

    if (role === UserRole.DESIGNER) {
      // Include tasks assigned directly OR via the junction table (split tasks)
      baseWhere.AND = [
        {
          OR: [
            { assigneeId: userId },
            { taskDesigners: { some: { designerId: userId } } },
          ],
        },
      ];
    }

    if (role === UserRole.QS) {
      const assignedProjectIds = await this.getAssignedProjectIdsForQsUser(userId);
      if (assignedProjectIds.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }
      baseWhere.projectId = { in: assignedProjectIds };
    }

    if (projectId) baseWhere.projectId = projectId;
    if (status) baseWhere.status = this.toDbTaskStatus(status);
    if (priority) baseWhere.priority = priority;
    if (assigneeId) baseWhere.assigneeId = assigneeId;
    if (search) {
      const searchOr = [
        { title: { contains: search } },
        { opNo: { contains: search } },
        { description: { contains: search } },
      ];
      if (baseWhere.AND) {
        (baseWhere.AND as any[]).push({ OR: searchOr });
      } else {
        baseWhere.OR = searchOr;
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where: baseWhere,
        select: TASK_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where: baseWhere }),
    ]);

    return {
      data: data.map((task) => this.normalizeTaskForApi(task)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, userId?: string, role?: UserRole) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const task = await this.prisma.task.findUnique({ where: { id }, select: TASK_SELECT });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertQsTaskAccess(id, userId, role);
    const withUrls = await this.withSignedAttachmentUrls(task);
    return this.normalizeTaskForApi(withUrls);
  }

  async update(id: string, dto: UpdateTaskDto) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        technicalHead: dto.technicalHead !== undefined ? (dto.technicalHead?.trim() || null) : undefined,
        teamLead: dto.teamLead !== undefined ? (dto.teamLead?.trim() || null) : undefined,
        subTeamLead: dto.subTeamLead !== undefined ? (dto.subTeamLead?.trim() || null) : undefined,
        designers: dto.designers !== undefined ? (dto.designers?.trim() || null) : undefined,
      },
      select: TASK_SELECT,
    });
    const withUrls = await this.withSignedAttachmentUrls(updated);
    return this.normalizeTaskForApi(withUrls);
  }

  async assign(id: string, actingUserId: string, dto: AssignTaskDto) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    const [assignee, oldAssignee] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.assigneeId } }),
      existing.assigneeId ? this.prisma.user.findUnique({ where: { id: existing.assigneeId }, select: { fullName: true } }) : null,
    ]);
    if (!assignee) throw new NotFoundException('Assignee not found');

    const rawStatus = String(existing.status ?? '').toUpperCase();
    const shouldPromote = rawStatus === 'DESIGN_NEW' || rawStatus === 'PENDING';
    const updatedTask = await this.prisma.task.update({
      where: { id },
      data: { assigneeId: dto.assigneeId, ...(shouldPromote ? { status: 'DESIGN_PLANNED' } : {}) },
      select: TASK_SELECT,
    });

    // Keep junction table in sync with direct assignment
    await this.prisma.taskDesigner.deleteMany({ where: { taskId: id } });
    await this.prisma.taskDesigner.create({ data: { taskId: id, designerId: dto.assigneeId } });

    await this.activityLogger.log({
      action: ActivityAction.ASSIGNED_TASK,
      userId: actingUserId,
      taskId: id,
      details: {
        event: ActivityAction.ASSIGNED_TASK,
        messageKey: 'task_assigned',
        taskSnapshot: {
          id: updatedTask.id,
          taskNo: updatedTask.taskNo,
          opNo: updatedTask.opNo,
          title: updatedTask.title ?? undefined,
          status: updatedTask.status,
        },
        projectSnapshot: {
          id: updatedTask.project?.id,
          projectNo: updatedTask.project?.projectNo,
          name: updatedTask.project?.name,
        },
        changes: {
          assigneeId: dto.assigneeId,
          newAssigneeName: assignee.fullName,
          oldAssigneeId: existing.assigneeId ?? null,
          oldAssigneeName: oldAssignee?.fullName ?? null,
        },
        context: { source: 'tasks.assign' },
      },
    });

    if (existing.assigneeId && existing.assigneeId !== dto.assigneeId) {
      this.dashboardRealtime?.notifyOverviewRefresh('task_reassigned');
    }

    const linkUrlAssign =
      updatedTask.designType?.toLowerCase() === 'retail'
        ? `/retail-task-view/${id}`
        : `/project-task-view/${id}`;
    const assignMessage = `${updatedTask.taskNo} — ${updatedTask.project?.name ?? 'Unknown Project'} has been assigned to ${assignee.fullName}`;
    const hodUsersAssign = await this.prisma.user.findMany({
      where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
      select: { id: true },
    });
    this.notificationsService
      .create({ userId: dto.assigneeId, title: 'Task Assigned to You', message: assignMessage, linkUrl: linkUrlAssign })
      .catch((err) => this.logger.error('Failed to send assign notification to designer', err));
    this.dashboardRealtime?.notifyUserNotificationRefresh(dto.assigneeId);
    for (const hod of hodUsersAssign) {
      if (hod.id !== dto.assigneeId) {
        this.notificationsService
          .create({ userId: hod.id, title: 'Task Assigned', message: assignMessage, linkUrl: linkUrlAssign })
          .catch((err) => this.logger.error('Failed to send assign notification to HOD', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
      }
    }

    const withUrls = await this.withSignedAttachmentUrls(updatedTask);
    return this.normalizeTaskForApi(withUrls);
  }

  async updateStatus(id: string, userId: string, role: UserRole, dto: UpdateTaskStatusDto) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    if (role === UserRole.DESIGNER && existing.assigneeId !== userId) {
      const inJunction = await this.prisma.taskDesigner.findUnique({
        where: { taskId_designerId: { taskId: id, designerId: userId } },
      });
      if (!inJunction) throw new ForbiddenException('Designers can only update status on their own tasks');
    }

    // Only SALESPERSON and ADMIN can issue rework
    const newStatusApi = this.toApiTaskStatus(dto.status);
    if (newStatusApi === 'REWORK' && role !== UserRole.SALESPERSON && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only SALESPERSON or ADMIN can issue rework');
    }

    // Auto-track startedAt / completedAt timestamps
    const now = new Date();
    let newStatusDb = this.toDbTaskStatus(dto.status);
    const extraData: Record<string, unknown> = {};

    // Going INTO ON_HOLD — store current status so it can be restored later
    if (newStatusApi === 'ON_HOLD') {
      extraData.holdPreviousStatus = existing.status;
    }

    // Coming OUT of ON_HOLD — restore the previously stored status regardless of what was sent
    const currentStatusApi = this.toApiTaskStatus(existing.status);
    if (currentStatusApi === 'ON_HOLD' && newStatusApi !== 'ON_HOLD') {
      newStatusDb = existing.holdPreviousStatus ?? newStatusDb;
      extraData.holdPreviousStatus = null;
    }

    // Use the effective status (after ON_HOLD restore) for timestamps, logging, and notifications
    const effectiveStatusApi = this.toApiTaskStatus(newStatusDb);

    if (effectiveStatusApi === 'IN_PROGRESS' && !existing.startedAt) extraData.startedAt = now;
    if (COMPLETED_STATUS_FILTER.includes(effectiveStatusApi)) extraData.completedAt = now;

    // When issuing REWORK from CLIENT_REJECTED: keep old task as CLIENT_REJECTED — only create the revision
    const skipStatusUpdate = currentStatusApi === 'CLIENT_REJECTED' && newStatusApi === 'REWORK';

    let updatedTask: Awaited<ReturnType<typeof this.prisma.task.findUniqueOrThrow>>;
    if (skipStatusUpdate) {
      updatedTask = await (this.prisma.task.findUniqueOrThrow as any)({ where: { id }, select: TASK_SELECT });
    } else {
      updatedTask = await (this.prisma.task.update as any)({
        where: { id },
        data: { status: newStatusDb, ...extraData },
        select: TASK_SELECT,
      });
    }

    // When transitioning to ON_HOLD, remove all future scheduler assignments so the
    // task doesn't appear as assigned on the scheduler grid
    if (newStatusApi === 'ON_HOLD') {
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      await this.prisma.schedulerAssignment.deleteMany({
        where: { taskId: id, weekStartDate: { gte: todayMidnight } },
      });
    }

    const milestoneAction =
      effectiveStatusApi === 'DESIGN_COMPLETED' ? ActivityAction.TASK_COMPLETED :
      effectiveStatusApi === 'CLIENT_ACCEPTED' ? ActivityAction.CLIENT_APPROVED :
      effectiveStatusApi === 'CLIENT_REJECTED'  ? ActivityAction.CLIENT_REJECTED_TASK :
      null;
    const logAction = milestoneAction ?? ActivityAction.STATUS_CHANGED;
    const messageKey = milestoneAction ? logAction.toLowerCase() : 'status_changed';

    await this.activityLogger.log({
      action: logAction,
      userId,
      taskId: id,
      details: {
        event: logAction,
        messageKey,
        taskSnapshot: {
          id: (updatedTask as any).id,
          taskNo: (updatedTask as any).taskNo,
          opNo: (updatedTask as any).opNo,
          title: (updatedTask as any).title ?? undefined,
          status: (updatedTask as any).status,
        },
        projectSnapshot: {
          id: (updatedTask as any).project?.id,
          projectNo: (updatedTask as any).project?.projectNo,
          name: (updatedTask as any).project?.name,
        },
        changes: {
          oldStatus: this.toApiTaskStatus(existing.status),
          newStatus: effectiveStatusApi,
        },
        context: { source: 'tasks.updateStatus' },
      },
    });

    if (COMPLETED_STATUS_FILTER.includes(effectiveStatusApi)) {
      this.dashboardRealtime?.notifyOverviewRefresh('task_completed');
    } else {
      this.dashboardRealtime?.notifyOverviewRefresh('task_status_changed');
    }

    if (COMPLETED_STATUS_FILTER.includes(effectiveStatusApi)) {
      const linkUrlStatus =
        (updatedTask as any).designType?.toLowerCase() === 'retail'
          ? `/retail-task-view/${id}`
          : `/project-task-view/${id}`;
      const statusMessage = `${(updatedTask as any).taskNo} — ${(updatedTask as any).project?.name ?? 'Unknown Project'} status changed to ${effectiveStatusApi}`;
      const hodUsersStatus = await this.prisma.user.findMany({
        where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
        select: { id: true },
      });
      if ((updatedTask as any).assigneeId) {
        this.notificationsService
          .create({ userId: (updatedTask as any).assigneeId, title: 'Task Marked Complete', message: statusMessage, linkUrl: linkUrlStatus })
          .catch((err) => this.logger.error('Failed to send complete notification to designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh((updatedTask as any).assigneeId);
      }
      // Notify split-task designers (junction table) who don't have assigneeId
      const splitDesignersComplete = await this.prisma.taskDesigner.findMany({
        where: { taskId: id, NOT: { designerId: (updatedTask as any).assigneeId ?? '' } },
        select: { designerId: true },
      });
      for (const { designerId } of splitDesignersComplete) {
        this.notificationsService
          .create({ userId: designerId, title: 'Task Marked Complete', message: statusMessage, linkUrl: linkUrlStatus })
          .catch((err) => this.logger.error('Failed to send complete notification to split designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(designerId);
      }
      for (const hod of hodUsersStatus) {
        if (hod.id !== (updatedTask as any).assigneeId) {
          this.notificationsService
            .create({ userId: hod.id, title: 'Task Completed', message: statusMessage, linkUrl: linkUrlStatus })
            .catch((err) => this.logger.error('Failed to send complete notification to HOD', err));
          this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
        }
      }
    }

    // SALES_REVIEW — notify all salesperson users that a task is waiting for their decision
    if (effectiveStatusApi === 'SALES_REVIEW') {
      const linkUrlSales =
        (updatedTask as any).designType?.toLowerCase() === 'retail'
          ? `/retail-task-view/${id}`
          : `/project-task-view/${id}`;
      const salesMessage = `${(updatedTask as any).taskNo} — ${(updatedTask as any).project?.name ?? 'Unknown Project'} is ready for your review.`;
      const salespersons = await this.prisma.user.findMany({
        where: { role: { name: 'SALESPERSON' } },
        select: { id: true },
      });
      for (const sp of salespersons) {
        this.notificationsService
          .create({ userId: sp.id, title: `Task Ready for Review — ${(updatedTask as any).taskNo}`, message: salesMessage, linkUrl: linkUrlSales })
          .catch((err) => this.logger.error('Failed to send sales-review notification to salesperson', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(sp.id);
      }
    }

    // REWORK — notify original designers and create new revision task
    let reworkResult: { id: string; taskNo: string } | null = null;
    if (effectiveStatusApi === 'REWORK') {
      const taskLink =
        (updatedTask as any).designType?.toLowerCase() === 'retail'
          ? `/retail-task-view/${id}`
          : `/project-task-view/${id}`;
      const note = dto.reworkNote?.trim() ?? '';

      // Notify the original task's designer(s) that rework was issued
      if ((updatedTask as any).assigneeId) {
        this.notificationsService
          .create({
            userId: (updatedTask as any).assigneeId,
            title: `Rework Issued — ${(updatedTask as any).taskNo}`,
            message: note || 'Task has been sent for rework.',
            linkUrl: taskLink,
          })
          .catch((err) => this.logger.error('Failed to send rework notification', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh((updatedTask as any).assigneeId);
      }
      const splitDesignersRework = await this.prisma.taskDesigner.findMany({
        where: { taskId: id, NOT: { designerId: (updatedTask as any).assigneeId ?? '' } },
        select: { designerId: true },
      });
      for (const { designerId } of splitDesignersRework) {
        this.notificationsService
          .create({
            userId: designerId,
            title: `Rework Issued — ${(updatedTask as any).taskNo}`,
            message: note || 'Task has been sent for rework.',
            linkUrl: taskLink,
          })
          .catch((err) => this.logger.error('Failed to send rework notification to split designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(designerId);
      }

      // Create the new revision task
      reworkResult = await this.createRevisionFromRework(existing, dto, userId);
    }

    const withUrls = await this.withSignedAttachmentUrls(updatedTask as any);
    const normalized = this.normalizeTaskForApi(withUrls);
    return {
      ...normalized,
      ...(reworkResult ? { newRevisionTaskId: reworkResult.id, newRevisionTaskNo: reworkResult.taskNo } : {}),
    };
  }

  private async createRevisionFromRework(
    originalTask: { id: string; projectId: string; opNo: string | null; designType: string | null; signType: string | null; signFamily: string | null; disciplineType: string | null; title: string | null; description: string | null; priority: string; dueDate: Date | null; technicalHead: string | null; teamLead: string | null; subTeamLead: string | null; designers: string | null },
    dto: UpdateTaskStatusDto,
    userId: string,
  ): Promise<{ id: string; taskNo: string }> {
    const opNo = originalTask.opNo ?? '';
    const designType = originalTask.designType ?? 'PROJECT';

    // Fetch detail rows and attachments from the original task
    const originalFull = await this.prisma.task.findUnique({
      where: { id: originalTask.id },
      select: {
        retailDetails: {
          select: {
            providedFile: true, fileKey: true, fileUrl: true, hodName: true,
            designTypes: true, hoursRequired: true, comment: true,
            signFamily: true, signType: true, planCode: true,
            contractRef: true, quantity: true, deadline: true,
            attachments: { select: { fileKey: true, fileName: true, mimeType: true, sizeBytes: true } },
          },
        },
        projectDetails: {
          select: {
            signType: true, planCode: true, area: true, level: true,
            artwork: true, artworkHours: true, technical: true, technicalHours: true,
            location: true, locationHours: true, asBuilt: true, asBuiltHours: true,
            bim: true, deadline: true, comment: true,
            attachments: { select: { fileKey: true, fileName: true, mimeType: true, sizeBytes: true } },
          },
        },
      },
    });

    this.logger.log(`createRevisionFromRework: start — original=${originalTask.id} opNo=${opNo} designType=${designType} projectId=${originalTask.projectId}`);
    const result = await this.prisma.$transaction(async (tx) => {
      // Resolve next revision code
      const nextRevision = await this.resolveNextRevisionCode(tx, {
        projectId: originalTask.projectId,
        opNo,
        designType,
        signType: originalTask.signType,
      });
      this.logger.log(`createRevisionFromRework: nextRevision=${nextRevision}`);

      const newTaskNo = this.buildTaskNo(opNo);

      // Build auto-title for project tasks (same pattern as createExtended)
      let newTitle: string | null = originalTask.title || null;
      if (designType === 'PROJECT' || designType === 'project') {
        newTitle = [opNo, originalTask.signType, originalTask.disciplineType, nextRevision]
          .filter(Boolean).join(' - ') || originalTask.title || null;
      }

      this.logger.log(`createRevisionFromRework: creating task taskNo=${newTaskNo} title=${newTitle}`);
      // Create the new revision task (core fields only — rework context applied separately below)
      const newTask = await tx.task.create({
        data: {
          taskNo: newTaskNo,
          opNo: opNo || null,
          title: newTitle,
          revisionCode: nextRevision,
          designType,
          signType: originalTask.signType,
          signFamily: originalTask.signFamily,
          disciplineType: originalTask.disciplineType,
          description: originalTask.description,
          status: 'DESIGN_NEW',
          priority: originalTask.priority,
          projectId: originalTask.projectId,
          assigneeId: null,
          dueDate: originalTask.dueDate,
          technicalHead: originalTask.technicalHead,
          teamLead: originalTask.teamLead,
          subTeamLead: originalTask.subTeamLead,
          designers: originalTask.designers,
        },
        select: { id: true, taskNo: true },
      });

      this.logger.log(`createRevisionFromRework: task created id=${newTask.id} taskNo=${newTask.taskNo}`);

      // Clone retail detail + attachments
      if (originalFull?.retailDetails && originalFull.retailDetails.length > 0) {
        for (const detail of originalFull.retailDetails) {
          const newDetail = await tx.retailTaskDetail.create({
            data: {
              taskId: newTask.id,
              providedFile: detail.providedFile,
              fileKey: detail.fileKey,
              fileUrl: detail.fileUrl,
              hodName: detail.hodName,
              designTypes: detail.designTypes,
              hoursRequired: detail.hoursRequired,
              comment: detail.comment,
              signFamily: detail.signFamily,
              signType: detail.signType,
              planCode: detail.planCode,
              contractRef: detail.contractRef,
              quantity: detail.quantity,
              deadline: detail.deadline,
            },
            select: { id: true },
          });
          for (const att of detail.attachments) {
            await tx.retailTaskDetailAttachment.create({
              data: { retailTaskDetailId: newDetail.id, fileKey: att.fileKey, fileName: att.fileName, mimeType: att.mimeType, sizeBytes: att.sizeBytes },
            });
          }
        }
      }

      // Clone project detail + attachments
      if (originalFull?.projectDetails && originalFull.projectDetails.length > 0) {
        for (const detail of originalFull.projectDetails) {
          const newDetail = await tx.projectTaskDetail.create({
            data: {
              taskId: newTask.id,
              signType: detail.signType,
              planCode: detail.planCode,
              area: detail.area,
              level: detail.level,
              artwork: detail.artwork,
              artworkHours: detail.artworkHours,
              technical: detail.technical,
              technicalHours: detail.technicalHours,
              location: detail.location,
              locationHours: detail.locationHours,
              asBuilt: detail.asBuilt,
              asBuiltHours: detail.asBuiltHours,
              bim: detail.bim,
              deadline: detail.deadline,
              comment: detail.comment,
            },
            select: { id: true },
          });
          for (const att of detail.attachments) {
            await tx.projectTaskDetailAttachment.create({
              data: { projectTaskDetailId: newDetail.id, fileKey: att.fileKey, fileName: att.fileName, mimeType: att.mimeType, sizeBytes: att.sizeBytes },
            });
          }
        }
      }

      return { id: newTask.id, taskNo: newTask.taskNo, _revision: nextRevision };
    });

    // Everything below uses this.prisma — must be outside the transaction to avoid P2028.

    // Rework context fields
    await (this.prisma.task.update as any)({
      where: { id: result.id },
      data: {
        reworkNote: dto.reworkNote?.trim() || null,
        reworkAttachmentUrl: dto.reworkAttachmentUrl || null,
        reworkAttachmentName: dto.reworkAttachmentName || null,
        reworkLinkUrl: dto.reworkLinkUrl || null,
        reworkLinkName: dto.reworkLinkName || null,
        previousRevisionTaskId: originalTask.id,
      },
    }).catch((err: unknown) => {
      this.logger.warn('Rework context fields not saved:', err);
    });

    // Chatter post with rework instructions
    const note = dto.reworkNote?.trim();
    if (note) {
      await this.prisma.chatterPost.create({
        data: {
          taskId: result.id,
          title: 'Rework Instructions',
          message: `Rework Required:\n\n${note}`,
          postType: 'REWORK',
          authorId: userId,
        },
      }).catch((err) => this.logger.error('Failed to create rework chatter post', err));
    }

    // Activity log
    await this.activityLogger.log({
      action: ActivityAction.TASK_CREATED,
      userId,
      taskId: result.id,
      details: {
        event: ActivityAction.TASK_CREATED,
        messageKey: 'task_created',
        taskSnapshot: { id: result.id, taskNo: result.taskNo },
        context: { source: 'rework_revision', previousTaskId: originalTask.id, revisionCode: result._revision },
      },
    }).catch((err) => this.logger.error('Failed to log rework revision activity', err));

    // Notify HODs
    const hodUsers = await this.prisma.user.findMany({
      where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
      select: { id: true },
    });
    const taskLink = designType?.toLowerCase() === 'retail'
      ? `/retail-task-view/${result.id}`
      : `/project-task-view/${result.id}`;
    for (const hod of hodUsers) {
      this.notificationsService
        .create({
          userId: hod.id,
          title: `New Revision Created — ${result.taskNo}`,
          message: `Revision ${result._revision} created from rework. Awaiting assignment.`,
          linkUrl: taskLink,
        })
        .catch((err) => this.logger.error('Failed to send new revision notification to HOD', err));
      this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
    }

    // Notify salesperson users so they can track the revision they triggered
    const salespersonsRevision = await this.prisma.user.findMany({
      where: { role: { name: 'SALESPERSON' } },
      select: { id: true },
    });
    for (const sp of salespersonsRevision) {
      this.notificationsService
        .create({
          userId: sp.id,
          title: `New Revision Created — ${result.taskNo}`,
          message: `Revision ${result._revision} created from your rework request. Awaiting designer assignment.`,
          linkUrl: taskLink,
        })
        .catch((err) => this.logger.error('Failed to send new revision notification to salesperson', err));
      this.dashboardRealtime?.notifyUserNotificationRefresh(sp.id);
    }

    return { id: result.id, taskNo: result.taskNo };
  }

  /** Dashboard: task counts per status for a given set of users */
  async getStatusSummary(userId: string, role: UserRole) {
    const where: Record<string, unknown> = {};

    if (role === UserRole.DESIGNER) {
      const junctionTaskIds = await this.prisma.taskDesigner.findMany({
        where: { designerId: userId },
        select: { taskId: true },
      });
      const splitIds = junctionTaskIds.map((r) => r.taskId);
      where.OR = [{ assigneeId: userId }, ...(splitIds.length > 0 ? [{ id: { in: splitIds } }] : [])];
    }

    const tasks = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    return tasks.reduce(
      (acc, row) => {
        acc[this.toApiTaskStatus(row.status)] = row._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  async remove(id: string) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    return this.prisma.task.delete({ where: { id } });
  }

  async getSignRows(taskId: string, userId?: string, role?: UserRole) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    await this.assertQsTaskAccess(taskId, userId, role);
    return this.prisma.projectSignRow.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
  }

  private normalizeQsStatus(value?: string | null): QsStatusValue {
    const text = String(value ?? '').trim().toLowerCase();
    if (text === 'completed') return QS_STATUS_COMPLETED;
    if (text === 'in progress' || text === 'in_progress' || text === 'inprogress') return QS_STATUS_IN_PROGRESS;
    return QS_STATUS_PENDING;
  }

  private async ensureQsStatusTable() {
    await this.prisma.$executeRawUnsafe(`
IF OBJECT_ID('dbo.ErpTSProjectQsStatus', 'U') IS NULL
BEGIN
  CREATE TABLE [dbo].[ErpTSProjectQsStatus] (
    [projectId] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_ErpTSProjectQsStatus_status] DEFAULT ('Pending'),
    [updatedById] UNIQUEIDENTIFIER NULL,
    [submittedById] UNIQUEIDENTIFIER NULL,
    [submittedAt] DATETIME2 NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_ErpTSProjectQsStatus_createdAt] DEFAULT SYSUTCDATETIME(),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_ErpTSProjectQsStatus_updatedAt] DEFAULT SYSUTCDATETIME(),
    CONSTRAINT [PK_ErpTSProjectQsStatus] PRIMARY KEY ([projectId]),
    CONSTRAINT [CK_ErpTSProjectQsStatus_status] CHECK ([status] IN ('Pending', 'In Progress', 'Completed')),
    CONSTRAINT [FK_ErpTSProjectQsStatus_Project] FOREIGN KEY ([projectId])
      REFERENCES [dbo].[ErpTSProject]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_ErpTSProjectQsStatus_UpdatedBy] FOREIGN KEY ([updatedById])
      REFERENCES [dbo].[ErpTSUser]([id]),
    CONSTRAINT [FK_ErpTSProjectQsStatus_SubmittedBy] FOREIGN KEY ([submittedById])
      REFERENCES [dbo].[ErpTSUser]([id])
  );
END;
    `);
  }

  private async getProjectQsStatus(projectId: string) {
    await this.ensureQsStatusTable();
    const rows = await this.prisma.$queryRaw<Array<{
      projectId: string;
      status: string;
      updatedById: string | null;
      submittedById: string | null;
      submittedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>>(Prisma.sql`
      SELECT TOP 1 [projectId], [status], [updatedById], [submittedById], [submittedAt], [createdAt], [updatedAt]
      FROM [dbo].[ErpTSProjectQsStatus]
      WHERE [projectId] = ${projectId}
    `);
    const row = rows[0];
    if (!row) {
      return {
        projectId,
        status: QS_STATUS_PENDING,
        updatedById: null,
        submittedById: null,
        submittedAt: null,
        createdAt: null,
        updatedAt: null,
      };
    }
    return { ...row, status: this.normalizeQsStatus(row.status) };
  }

  private async setProjectQsStatus(
    projectId: string,
    status: QsStatusValue,
    userId?: string,
  ) {
    await this.ensureQsStatusTable();
    await this.prisma.$executeRaw(Prisma.sql`
      MERGE [dbo].[ErpTSProjectQsStatus] WITH (HOLDLOCK) AS [target]
      USING (SELECT ${projectId} AS [projectId]) AS [source]
      ON [target].[projectId] = [source].[projectId]
      WHEN MATCHED THEN UPDATE SET
        [status] = ${status},
        [updatedById] = ${userId ?? null},
        [submittedById] = CASE WHEN ${status} = 'Completed' THEN ${userId ?? null} ELSE NULL END,
        [submittedAt] = CASE WHEN ${status} = 'Completed' THEN COALESCE([target].[submittedAt], SYSUTCDATETIME()) ELSE NULL END,
        [updatedAt] = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT ([projectId], [status], [updatedById], [submittedById], [submittedAt])
        VALUES (
          ${projectId},
          ${status},
          ${userId ?? null},
          CASE WHEN ${status} = 'Completed' THEN ${userId ?? null} ELSE NULL END,
          CASE WHEN ${status} = 'Completed' THEN SYSUTCDATETIME() ELSE NULL END
        );
    `);
    return this.getProjectQsStatus(projectId);
  }

  async getQsStatusForTask(taskId: string, userId?: string, role?: UserRole) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertQsTaskAccess(taskId, userId, role);
    return this.getProjectQsStatus(task.projectId);
  }

  async updateQsStatusForTask(taskId: string, dto: UpdateQsStatusDto, userId?: string, role?: UserRole) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, taskNo: true, title: true, projectId: true, project: { select: { id: true, projectNo: true, name: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertQsTaskAccess(taskId, userId, role);
    const previous = await this.getProjectQsStatus(task.projectId);
    const nextStatus = this.normalizeQsStatus(dto.status);
    const next = await this.setProjectQsStatus(task.projectId, nextStatus, userId);
    if (userId && previous.status !== next.status) {
      await this.activityLogger.log({
        action: ActivityAction.QS_STATUS_CHANGED,
        userId,
        taskId,
        details: {
          event: ActivityAction.QS_STATUS_CHANGED,
          messageKey: 'qs_status_changed',
          taskSnapshot: { id: task.id, taskNo: task.taskNo, title: task.title ?? undefined },
          projectSnapshot: { id: task.project?.id, projectNo: task.project?.projectNo, name: task.project?.name },
          changes: { oldStatus: previous.status, newStatus: next.status },
          context: { source: 'tasks.updateQsStatusForTask', note: dto.note ?? null },
        },
      });
    }
    return next;
  }

  private normalizeSignRows(dto: SaveSignRowsDto) {
    if (!Array.isArray(dto.rows)) throw new BadRequestException('Sign rows payload is required');

    return dto.rows.map((row, index) => {
      const normalized = {
        id: row.id?.trim() || undefined,
        tNo: row.tNo?.trim() || '',
        no: row.no?.trim() || '',
        signType: row.signType?.trim() || '',
        planCode: row.planCode?.trim() || '',
        estQty: row.estQty,
        qsQty: row.qsQty,
        areaZone: row.areaZone?.trim() || '',
        levelParcel: row.levelParcel?.trim() || '',
        sequence: row.sequence?.trim() || '',
        status: row.status?.trim() || '',
        comment: row.comment?.trim() || null,
        contRef: row.contRef?.trim() || '',
      };

      for (const [field, label] of SIGN_ROW_REQUIRED_FIELDS) {
        const value = normalized[field];
        if (value === undefined || value === null || String(value).trim() === '') {
          throw new BadRequestException(`${label} is required in row ${index + 1}`);
        }
      }
      if (!Number.isInteger(normalized.estQty)) {
        throw new BadRequestException(`Est QTY must be a whole number in row ${index + 1}`);
      }
      if (!Number.isInteger(normalized.qsQty)) {
        throw new BadRequestException(`QS QTY must be a whole number in row ${index + 1}`);
      }
      return normalized;
    });
  }

  async submitWork(
    taskId: string,
    userId: string,
    dto: SubmitWorkDto,
    files: Express.Multer.File[],
  ) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    if (!task) throw new NotFoundException('Task not found');

    // Upload files to S3
    const uploadedFiles: { fileKey: string; fileName: string; mimeType: string; sizeBytes: number }[] = [];
    for (const file of files ?? []) {
      const result = await this.taskFilesService.uploadTaskFile(file, userId);
      uploadedFiles.push({
        fileKey: result.key,
        fileName: result.fileName,
        mimeType: result.mimeType,
        sizeBytes: result.size,
      });
    }

    // Create/promote work session + files in a transaction, then update task status
    const session = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.taskWorkSession.findFirst({
        where: { taskId, designerId: userId, status: 'Draft' },
      });

      let session;
      if (draft) {
        session = await tx.taskWorkSession.update({
          where: { id: draft.id },
          data: {
            durationSeconds: dto.durationSeconds,
            submissionLink: dto.submissionLink?.trim() || null,
            pauseLog: dto.pauseLog || draft.pauseLog || null,
            status: 'Submitted',
            submittedAt: new Date(),
          },
        });
      } else {
        session = await tx.taskWorkSession.create({
          data: {
            taskId,
            designerId: userId,
            durationSeconds: dto.durationSeconds,
            submissionLink: dto.submissionLink?.trim() || null,
            pauseLog: dto.pauseLog || null,
            status: 'Submitted',
          },
        });
      }

      if (uploadedFiles.length > 0) {
        await tx.taskWorkSessionFile.createMany({
          data: uploadedFiles.map((f) => ({
            sessionId: session.id,
            fileKey: f.fileKey,
            fileName: f.fileName,
            mimeType: f.mimeType || null,
            sizeBytes: BigInt(f.sizeBytes),
          })),
        });
      }

      await tx.task.update({
        where: { id: taskId },
        data: {
          status: 'DESIGN_COMPLETED',
          completedAt: new Date(),
          ...(task.startedAt ? {} : { startedAt: new Date() }),
        },
      });

      return session;
    });

    const previousStatusApi = this.toApiTaskStatus(task.status);
    const submittedTaskSnapshot = {
      id: task.id,
      taskNo: task.taskNo,
      opNo: task.opNo,
      title: task.title ?? undefined,
      status: 'DESIGN_COMPLETED',
    };
    const submittedProjectSnapshot = {
      id: task.project?.id,
      projectNo: task.project?.projectNo,
      name: task.project?.name,
    };

    await this.activityLogger.log({
      action: ActivityAction.TASK_WORK_SUBMITTED,
      userId,
      taskId,
      details: {
        event: ActivityAction.TASK_WORK_SUBMITTED,
        messageKey: 'task_work_submitted',
        taskSnapshot: submittedTaskSnapshot,
        projectSnapshot: submittedProjectSnapshot,
        changes: {
          durationSeconds: dto.durationSeconds,
          fileCount: uploadedFiles.length,
          hasLink: !!dto.submissionLink,
        },
        context: { sessionId: session.id, source: 'tasks.submitWork' },
      },
    });

    if (!COMPLETED_STATUS_FILTER.includes(previousStatusApi)) {
      await this.activityLogger.log({
        action: ActivityAction.TASK_COMPLETED,
        userId,
        taskId,
        details: {
          event: ActivityAction.TASK_COMPLETED,
          messageKey: 'task_completed',
          taskSnapshot: submittedTaskSnapshot,
          projectSnapshot: submittedProjectSnapshot,
          changes: {
            oldStatus: previousStatusApi,
            newStatus: 'DESIGN_COMPLETED',
          },
          context: { sessionId: session.id, source: 'tasks.submitWork' },
        },
      });
    }

    // Notify all HODs that work has been submitted and is ready for review
    try {
      const submittedTask = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: {
          taskNo: true,
          designType: true,
          project: { select: { name: true } },
          assignee: { select: { fullName: true } },
          taskDesigners: { select: { designer: { select: { fullName: true } } } },
        },
      });
      if (submittedTask) {
        const taskLink =
          submittedTask.designType?.toLowerCase() === 'retail'
            ? `/retail-task-view/${taskId}`
            : `/project-task-view/${taskId}`;
        const submitterName =
          submittedTask.assignee?.fullName ??
          ((submittedTask as any).taskDesigners?.length > 0
            ? (submittedTask as any).taskDesigners.map((d: any) => d.designer.fullName).join(', ')
            : 'Designer');
        const submitMsg = `${submittedTask.taskNo} — ${submittedTask.project?.name ?? 'Unknown Project'} work submitted by ${submitterName}. Ready for review.`;
        const hodUsers = await this.prisma.user.findMany({
          where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
          select: { id: true },
        });
        for (const hod of hodUsers) {
          this.notificationsService
            .create({ userId: hod.id, title: `Work Submitted — ${submittedTask.taskNo}`, message: submitMsg, linkUrl: taskLink })
            .catch((err) => this.logger.error('Failed to send work-submitted notification', err));
          this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
        }
      }
    } catch (err) {
      this.logger.error('Failed to send work-submitted notifications to HOD', err);
    }

    return { sessionId: session.id, fileCount: uploadedFiles.length };
  }

  async getSubmittedSession(taskId: string) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const session = await this.prisma.taskWorkSession.findFirst({
      where: { taskId, status: 'Submitted' },
      orderBy: { submittedAt: 'desc' },
      include: {
        files: true,
        designer: { select: { fullName: true } },
      },
    });
    if (!session) return null;
    return {
      durationSeconds: session.durationSeconds,
      submittedAt: session.submittedAt,
      submissionLink: session.submissionLink,
      submittedBy: session.designer?.fullName ?? null,
      files: await Promise.all(session.files.map(async (f) => ({
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes == null ? null : Number(f.sizeBytes),
        fileUrl: f.fileKey ? await this.taskFilesService.createSignedReadUrl(f.fileKey) : null,
      }))),
    };
  }

  async getTimerState(taskId: string, userId: string) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const draft = await this.prisma.taskWorkSession.findFirst({
      where: { taskId, designerId: userId, status: 'Draft' },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) return null;
    return { accumulatedSeconds: draft.durationSeconds, pauseLog: draft.pauseLog ?? null };
  }

  async saveTimerState(taskId: string, userId: string, dto: SaveTimerStateDto) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');

    const existing = await this.prisma.taskWorkSession.findFirst({
      where: { taskId, designerId: userId, status: 'Draft' },
    });

    if (existing) {
      await this.prisma.taskWorkSession.update({
        where: { id: existing.id },
        data: {
          durationSeconds: dto.accumulatedSeconds,
          pauseLog: dto.pauseLog ?? existing.pauseLog,
        },
      });
      return { sessionId: existing.id };
    }

    const created = await this.prisma.taskWorkSession.create({
      data: {
        taskId,
        designerId: userId,
        durationSeconds: dto.accumulatedSeconds,
        pauseLog: dto.pauseLog ?? null,
        status: 'Draft',
      },
    });
    return { sessionId: created.id };
  }

  private hasRowChanges(before: any, after: Record<string, unknown>) {
    return ['tNo', 'no', 'signType', 'planCode', 'estQty', 'qsQty', 'areaZone', 'levelParcel', 'sequence', 'status', 'comment', 'contRef']
      .some((field) => (before?.[field] ?? null) !== (after[field] ?? null));
  }

  private rowLabel(row: any) {
    return row?.no || row?.tNo || row?.signType || 'Sign row';
  }

  private async persistSignRows(taskId: string, dto: SaveSignRowsDto, userId?: string, role?: UserRole, allowCompleted = false) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const existing = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, taskNo: true, title: true, projectId: true, project: { select: { id: true, projectNo: true, name: true } } },
    });
    if (!existing) throw new NotFoundException('Task not found');
    await this.assertQsTaskAccess(taskId, userId, role);
    const currentStatus = await this.getProjectQsStatus(existing.projectId);
    if (!allowCompleted && currentStatus.status === QS_STATUS_COMPLETED) {
      throw new BadRequestException('Completed QS projects are read-only. Reopen the QS status before editing sign rows.');
    }
    const rowsToPersist = this.normalizeSignRows(dto);
    const existingRows = await this.prisma.projectSignRow.findMany({ where: { taskId }, orderBy: { createdAt: 'asc' } });
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const incomingIds = new Set(rowsToPersist.map((row) => row.id).filter(Boolean));
    const auditEvents: Array<{ action: typeof ActivityAction[keyof typeof ActivityAction]; before?: any; after?: any }> = [];

    const savedRows = await this.prisma.$transaction(async (tx) => {
      for (const row of rowsToPersist) {
        const { id, ...data } = row;
        if (id && existingById.has(id)) {
          const before = existingById.get(id);
          if (this.hasRowChanges(before, data)) {
            await tx.projectSignRow.update({ where: { id }, data });
            auditEvents.push({ action: ActivityAction.QS_SIGN_ROW_UPDATED, before, after: { id, ...data } });
          }
        } else {
          const created = await tx.projectSignRow.create({ data: { taskId, ...data } });
          auditEvents.push({ action: ActivityAction.QS_SIGN_ROW_ADDED, after: created });
        }
      }
      for (const row of existingRows) {
        if (!incomingIds.has(row.id)) {
          await tx.projectSignRow.delete({ where: { id: row.id } });
          auditEvents.push({ action: ActivityAction.QS_SIGN_ROW_DELETED, before: row });
        }
      }
      return tx.projectSignRow.findMany({
        where: { taskId },
        orderBy: { createdAt: 'asc' },
      });
    });
    if (savedRows.length !== rowsToPersist.length) {
      throw new BadRequestException('Sign rows were not persisted correctly');
    }
    if (userId) {
      for (const event of auditEvents) {
        const row = event.after ?? event.before;
        await this.activityLogger.log({
          action: event.action,
          userId,
          taskId,
          details: {
            event: event.action,
            messageKey:
              event.action === ActivityAction.QS_SIGN_ROW_ADDED
                ? 'qs_sign_row_added'
                : event.action === ActivityAction.QS_SIGN_ROW_UPDATED
                  ? 'qs_sign_row_updated'
                  : 'qs_sign_row_deleted',
            taskSnapshot: {
              id: existing.id,
              taskNo: existing.taskNo,
              title: existing.title ?? undefined,
            },
            projectSnapshot: {
              id: existing.project?.id,
              projectNo: existing.project?.projectNo,
              name: existing.project?.name,
            },
            changes: {
              rowId: row?.id ?? null,
              rowLabel: this.rowLabel(row),
              before: event.before ?? null,
              after: event.after ?? null,
            },
            context: { source: 'tasks.persistSignRows', updatedByRole: role ?? null },
          },
        });
      }
      await this.activityLogger.log({
        action: ActivityAction.SIGN_FAMILY_UPDATED,
        userId,
        taskId,
        details: {
          event: ActivityAction.SIGN_FAMILY_UPDATED,
          messageKey: 'sign_family_updated',
          taskSnapshot: {
            id: existing.id,
            taskNo: existing.taskNo,
            title: existing.title ?? undefined,
          },
          projectSnapshot: {
            id: existing.project?.id,
            projectNo: existing.project?.projectNo,
            name: existing.project?.name,
          },
          context: {
            source: 'tasks.saveSignRows',
            rowCount: savedRows.length,
            updatedByRole: role ?? null,
          },
        },
      });
    }
    if (currentStatus.status !== QS_STATUS_COMPLETED) {
      const nextStatus = savedRows.length > 0 ? QS_STATUS_IN_PROGRESS : QS_STATUS_PENDING;
      if (currentStatus.status !== nextStatus) {
        await this.setProjectQsStatus(existing.projectId, nextStatus, userId);
        if (userId) {
          await this.activityLogger.log({
            action: ActivityAction.QS_STATUS_CHANGED,
            userId,
            taskId,
            details: {
              event: ActivityAction.QS_STATUS_CHANGED,
              messageKey: 'qs_status_changed',
              taskSnapshot: { id: existing.id, taskNo: existing.taskNo, title: existing.title ?? undefined },
              projectSnapshot: { id: existing.project?.id, projectNo: existing.project?.projectNo, name: existing.project?.name },
              changes: { oldStatus: currentStatus.status, newStatus: nextStatus },
              context: { source: 'tasks.persistSignRows' },
            },
          });
        }
      }
    }
    return savedRows;
  }

  async saveSignRows(taskId: string, dto: SaveSignRowsDto, userId?: string, role?: UserRole) {
    return this.persistSignRows(taskId, dto, userId, role);
  }

  async submitQsUpdate(taskId: string, dto: SaveSignRowsDto, userId?: string, role?: UserRole) {
    if (!userId) throw new ForbiddenException('QS submission requires an authenticated user');
    if (!Array.isArray(dto.rows) || dto.rows.length === 0) {
      throw new BadRequestException('Add at least one complete sign row before submitting the QS update.');
    }
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, taskNo: true, title: true, projectId: true, project: { select: { id: true, projectNo: true, name: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertQsTaskAccess(taskId, userId, role);
    const previousStatus = await this.getProjectQsStatus(task.projectId);
    if (previousStatus.status === QS_STATUS_COMPLETED) {
      throw new BadRequestException('This QS project has already been submitted and is read-only.');
    }

    const rows = await this.persistSignRows(taskId, dto, userId, role, true);
    const nextStatus = await this.setProjectQsStatus(task.projectId, QS_STATUS_COMPLETED, userId);
    await this.activityLogger.log({
      action: ActivityAction.QS_UPDATE_SUBMITTED,
      userId,
      taskId,
      details: {
        event: ActivityAction.QS_UPDATE_SUBMITTED,
        messageKey: 'qs_update_submitted',
        taskSnapshot: { id: task.id, taskNo: task.taskNo, title: task.title ?? undefined },
        projectSnapshot: { id: task.project?.id, projectNo: task.project?.projectNo, name: task.project?.name },
        changes: { rowCount: rows.length, oldStatus: previousStatus.status, newStatus: nextStatus.status },
        context: { source: 'tasks.submitQsUpdate', submittedByRole: role ?? null },
      },
    });
    if (previousStatus.status !== QS_STATUS_COMPLETED) {
      await this.activityLogger.log({
        action: ActivityAction.QS_STATUS_CHANGED,
        userId,
        taskId,
        details: {
          event: ActivityAction.QS_STATUS_CHANGED,
          messageKey: 'qs_status_changed',
          taskSnapshot: { id: task.id, taskNo: task.taskNo, title: task.title ?? undefined },
          projectSnapshot: { id: task.project?.id, projectNo: task.project?.projectNo, name: task.project?.name },
          changes: { oldStatus: previousStatus.status, newStatus: nextStatus.status },
          context: { source: 'tasks.submitQsUpdate' },
        },
      });
    }

    const hodUsers = await this.prisma.user.findMany({
      where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
      select: { id: true },
    });
    const taskLink = `/project-task-view/${taskId}?from=qs`;
    const message = `${task.project?.projectNo ? `${task.project.projectNo} — ` : ''}${task.project?.name ?? 'Project'} QS update submitted with ${rows.length} sign row(s).`;
    for (const hod of hodUsers) {
      this.notificationsService
        .create({ userId: hod.id, title: 'QS Update Submitted', message, linkUrl: taskLink })
        .catch((err) => this.logger.error('Failed to send QS submission notification', err));
      this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
    }

    return { status: nextStatus.status, qsStatus: nextStatus, rows };
  }

  private async getAssignedProjectIdsForQsUser(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ projectId: string }>>(Prisma.sql`
      SELECT [projectId] AS [projectId]
      FROM [ErpTSProjectQsAssignment]
      WHERE [qsUserId] = ${userId}
    `);
    return rows.map((row) => row.projectId);
  }

  private async assignProjectToQsTeam(
    projectId: string,
    actingUserId: string | null,
    project: { name: string; projectNo?: string | null },
  ) {
    const qsUsers = await this.prisma.user.findMany({
      where: { role: { name: UserRole.QS } },
      select: { id: true },
    });
    if (qsUsers.length === 0) return;

    const assignedCount = await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO [ErpTSProjectQsAssignment] ([projectId], [qsUserId])
      SELECT ${projectId}, [incoming].[qsUserId]
      FROM (VALUES ${Prisma.join(qsUsers.map((user) => Prisma.sql`(${user.id})`))}) AS [incoming]([qsUserId])
      WHERE NOT EXISTS (
        SELECT 1
        FROM [ErpTSProjectQsAssignment] [existing]
        WHERE [existing].[projectId] = ${projectId}
          AND [existing].[qsUserId] = [incoming].[qsUserId]
      )
    `);
    if (assignedCount === 0) return;

    const linkUrl = `/project-task-view/${projectId}`;
    const message = `${project.projectNo ? `${project.projectNo} — ` : ''}${project.name} has been assigned to QS for Sign Family review.`;
    for (const qsUser of qsUsers) {
      await this.notificationsService.create({
        userId: qsUser.id,
        title: 'New Project Assigned to QS',
        message,
        linkUrl,
      });
      this.dashboardRealtime?.notifyUserNotificationRefresh(qsUser.id);
    }

    if (actingUserId) {
      await this.activityLogger.log({
        action: ActivityAction.QS_PROJECT_ASSIGNED,
        userId: actingUserId,
        details: {
          event: ActivityAction.QS_PROJECT_ASSIGNED,
          messageKey: 'qs_project_assigned',
          projectSnapshot: {
            id: projectId,
            projectNo: project.projectNo ?? null,
            name: project.name,
          },
          context: {
            assignedUserIds: qsUsers.map((user) => user.id),
            source: 'tasks.assignProjectToQsTeam',
          },
        },
      });
    }
  }

  private async assertQsTaskAccess(taskId: string, userId?: string, role?: UserRole) {
    if (role !== UserRole.QS) return;
    if (!userId) throw new ForbiddenException('QS access requires an authenticated user');
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT TOP 1 [assignment].[id] AS [id]
      FROM [ErpTSProjectQsAssignment] [assignment]
      INNER JOIN [ErpTSTask] [task] ON [task].[projectId] = [assignment].[projectId]
      WHERE [task].[id] = ${taskId}
        AND [assignment].[qsUserId] = ${userId}
    `);
    if (rows.length === 0) {
      throw new ForbiddenException('QS users can only access tasks for assigned projects');
    }
  }
}
