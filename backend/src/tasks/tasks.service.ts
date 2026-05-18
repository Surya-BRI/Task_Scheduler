import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UserRole } from '../common/constants/roles.enum';
import { CreateExtendedTaskDto } from './dto/create-extended-task.dto';
import { TaskFilesService } from './task-files.service';

const TASK_SELECT = {
  id: true,
  taskNo: true,
  opNo: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  projectId: true,
  project: { select: { id: true, name: true, projectNo: true, category: true } },
  assigneeId: true,
  assignee: { select: { id: true, fullName: true, email: true } },
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

export type TaskFilters = {
  projectId?: string;
  status?: string;
  priority?: string;
  assigneeId?: string;
  search?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskFilesService: TaskFilesService,
  ) {}

  private async withSignedAttachmentUrls<T extends { retailDetails?: any[]; projectDetails?: any[] }>(task: T): Promise<T> {
    const allKeys = [
      ...(task.retailDetails ?? []).flatMap((line) => (line.attachments ?? []).map((a: any) => a.fileKey)),
      ...(task.projectDetails ?? []).flatMap((line) => (line.attachments ?? []).map((a: any) => a.fileKey)),
    ].filter(Boolean);
    const uniqueKeys = Array.from(new Set(allKeys));
    const signedMap = new Map<string, string>();
    await Promise.all(
      uniqueKeys.map(async (key) => {
        const signedUrl = await this.taskFilesService.createSignedReadUrl(key);
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
    const existing = await this.resolveProjectForCreate(task).catch(() => null);
    if (existing) return existing;

    const projectNo = (task.projectNo ?? task.opNo ?? '').trim();
    if (!projectNo) {
      throw new BadRequestException('projectNo or opNo is required to create project in ERP-Dev');
    }

    const name = (task.projectName ?? task.title ?? '').trim() || `Project ${projectNo}`;
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

  async create(dto: CreateTaskDto) {
    const project = await this.resolveProjectForCreate({
      projectNo: dto.projectNo,
      opNo: dto.opNo,
    });

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.task.create({
          data: {
            taskNo: this.buildTaskNo(dto.opNo),
            title: dto.title,
            opNo: dto.opNo,
            description: dto.description,
            priority: dto.priority ?? 'Medium',
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            projectId: project.id,
            assigneeId: dto.assigneeId ?? null,
          },
          select: TASK_SELECT,
        });
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

  async createExtended(dto: CreateExtendedTaskDto) {
    const hasRetail = (dto.retailDetails?.length ?? 0) > 0;
    const hasProject = (dto.projectDetails?.length ?? 0) > 0;

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
    ];
    if (fileKeysToCheck.length > 0) {
      await this.taskFilesService.assertKeysExist(fileKeysToCheck);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      let taskId: string | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const createdTask = await tx.task.create({
            data: {
              taskNo: this.buildTaskNo(dto.task.opNo),
              title: dto.task.title,
              opNo: dto.task.opNo,
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

      if (dto.designType === 'Retail' && hasRetail) {
        for (const line of dto.retailDetails ?? []) {
          const createdLine = await tx.retailTaskDetail.create({
            data: {
              taskId,
              providedFile: line.providedFile,
              fileUrl: line.fileUrl,
              hodName: line.hodName,
              designTypes: line.designTypes?.length ? line.designTypes.join(',') : null,
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
      }

      if (dto.designType === 'Project' && hasProject) {
        for (const line of dto.projectDetails ?? []) {
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
        }
      }

      return tx.task.findUnique({
        where: { id: taskId },
        select: TASK_SELECT,
      });
    });

    if (!created) throw new NotFoundException('Task not found after create');
    return this.withSignedAttachmentUrls(created);
  }

  async findAll(userId: string, role: UserRole, filters: TaskFilters = {}) {
    const { projectId, status, priority, assigneeId, search, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    // Designers only see their own tasks
    const baseWhere: Record<string, unknown> =
      role === UserRole.DESIGNER ? { assigneeId: userId } : {};

    if (projectId) baseWhere.projectId = projectId;
    if (status) baseWhere.status = status;
    if (priority) baseWhere.priority = priority;
    if (assigneeId) baseWhere.assigneeId = assigneeId;
    if (search) {
      baseWhere.OR = [
        { title: { contains: search } },
        { opNo: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where: baseWhere,
        select: TASK_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where: baseWhere }),
    ]);

    return {
      data: await Promise.all(data.map((task) => this.withSignedAttachmentUrls(task))),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, select: TASK_SELECT });
    if (!task) throw new NotFoundException('Task not found');
    return this.withSignedAttachmentUrls(task);
  }

  async update(id: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      select: TASK_SELECT,
    });
    return this.withSignedAttachmentUrls(updated);
  }

  async assign(id: string, dto: AssignTaskDto) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
    if (!assignee) throw new NotFoundException('Assignee not found');

    const updatedTask = await this.prisma.task.update({
      where: { id },
      data: { assigneeId: dto.assigneeId },
      select: TASK_SELECT,
    });

    try {
      await this.prisma.activityLog.create({
        data: {
          action: 'ASSIGNED_TASK',
          details: JSON.stringify({ title: updatedTask.title, newAssignee: assignee.fullName }),
          userId: dto.assigneeId, // Assuming assignee if we don't have acting user
          taskId: id,
        }
      });
    } catch {
      // Activity logging is best-effort
    }

    return this.withSignedAttachmentUrls(updatedTask);
  }

  async updateStatus(id: string, userId: string, role: UserRole, dto: UpdateTaskStatusDto) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    if (role === UserRole.DESIGNER && existing.assigneeId !== userId) {
      throw new ForbiddenException('Designers can only update status on their own tasks');
    }

    // Auto-track startedAt / completedAt timestamps
    const now = new Date();
    const extraData: Record<string, unknown> = {};
    if (dto.status === 'WIP' && !existing.startedAt) extraData.startedAt = now;
    if (dto.status === 'COMPLETED' || dto.status === 'APPROVED') extraData.completedAt = now;

    const updatedTask = await this.prisma.task.update({
      where: { id },
      data: { status: dto.status, ...extraData },
      select: TASK_SELECT,
    });

    try {
      await this.prisma.activityLog.create({
        data: {
          action: 'STATUS_CHANGED',
          details: JSON.stringify({ title: updatedTask.title, oldStatus: existing.status, newStatus: dto.status }),
          userId: userId,
          taskId: id,
        }
      });
    } catch {
      // Activity logging is best-effort
    }

    return this.withSignedAttachmentUrls(updatedTask);
  }

  /** Dashboard: task counts per status for a given set of users */
  async getStatusSummary(userId: string, role: UserRole) {
    const where: Record<string, unknown> =
      role === UserRole.DESIGNER ? { assigneeId: userId } : {};

    const tasks = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    return tasks.reduce(
      (acc, row) => {
        acc[row.status] = row._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  async remove(id: string) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    return this.prisma.task.delete({ where: { id } });
  }
}
