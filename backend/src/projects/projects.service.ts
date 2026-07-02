import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectFileLinkDto } from './dto/create-project-file-link.dto';
import { TaskFilesService } from '../tasks/task-files.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';
import { UserRole } from '../common/constants/roles.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';
import { SaveSignRowsDto } from '../tasks/dto/save-sign-rows.dto';
import { QsStatusValue, UpdateQsStatusDto } from '../tasks/dto/update-qs-status.dto';

const PROJECT_SELECT = {
  id: true,
  projectNo: true,
  name: true,
  category: true,
  businessUnit: true,
  description: true,
  status: true,
  salesPerson: true,
  technicalHead: true,
  teamLead: true,
  subTeamLead: true,
  designers: true,
  createdById: true,
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { tasks: true } },
  createdAt: true,
  updatedAt: true,
};

const QS_STATUS_PENDING: QsStatusValue = 'Pending';
const QS_STATUS_IN_PROGRESS: QsStatusValue = 'In Progress';
const QS_STATUS_COMPLETED: QsStatusValue = 'Completed';
const QS_STATUS_VALUES = new Set<string>([QS_STATUS_PENDING, QS_STATUS_IN_PROGRESS, QS_STATUS_COMPLETED]);

const SIGN_ROW_FIELDS = ['tNo', 'no', 'signType', 'planCode', 'estQty', 'qsQty', 'areaZone', 'levelParcel', 'sequence', 'status', 'comment', 'contRef', 'signFamily'] as const;

export type ProjectFilters = {
  status?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskFilesService: TaskFilesService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  private isAbsoluteHttpUrl(value: string) {
    return /^https?:\/\//i.test(String(value ?? '').trim());
  }

  private normalizeQsStatus(value?: string | null) {
    const text = String(value ?? '').trim();
    return QS_STATUS_VALUES.has(text) ? text : QS_STATUS_PENDING;
  }

  private async ensureQsStatusTable() {
    // security-sql:allow-static-ddl
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

  private async withQsStatuses<T extends { id: string }>(projects: T[]): Promise<Array<T & { qsStatus: any }>> {
    if (projects.length === 0) return [];
    await this.ensureQsStatusTable();
    const rows = await this.prisma.$queryRaw<Array<{
      projectId: string;
      status: string;
      submittedById: string | null;
      submittedAt: Date | null;
      updatedAt: Date;
    }>>(Prisma.sql`
      SELECT [projectId], [status], [submittedById], [submittedAt], [updatedAt]
      FROM [dbo].[ErpTSProjectQsStatus]
      WHERE [projectId] IN (${Prisma.join(projects.map((project) => project.id))})
    `);
    const byProject = new Map(rows.map((row) => [row.projectId, row]));
    return projects.map((project) => {
      const row = byProject.get(project.id);
      return {
        ...project,
        qsStatus: {
          projectId: project.id,
          status: this.normalizeQsStatus(row?.status),
          submittedById: row?.submittedById ?? null,
          submittedAt: row?.submittedAt ?? null,
          updatedAt: row?.updatedAt ?? null,
        },
      };
    });
  }

  async create(createdById: string, dto: CreateProjectDto) {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        projectNo: dto.projectNo,
        category: dto.category ?? 'Project',
        businessUnit: dto.businessUnit,
        description: dto.description,
        status: dto.status ?? 'ACTIVE',
        salesPerson: dto.salesPerson,
        createdById,
      },
      select: PROJECT_SELECT,
    });
    await this.assignProjectToQsTeam(project.id, createdById, {
      name: project.name,
      projectNo: project.projectNo,
    });
    return project;
  }

  async findAll(filters: ProjectFilters = {}, currentUserId?: string, currentUserRole?: string) {
    const { status, category, search, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (currentUserRole === UserRole.QS && currentUserId) {
      const assignedProjectIds = await this.getAssignedProjectIdsForQsUser(currentUserId);
      if (assignedProjectIds.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }
      where.id = { in: assignedProjectIds };
    }
    if (status) where.status = status;
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { projectNo: { contains: search } },
        { salesPerson: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        select: PROJECT_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.project.count({ where }),
    ]);

    return {
      data: await this.withQsStatuses(data),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, currentUserId?: string, currentUserRole?: string) {
    await this.assertProjectAccess(id, currentUserId, currentUserRole);
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: {
        ...PROJECT_SELECT,
        tasks: {
          select: {
            id: true,
            opNo: true,
            title: true,
            status: true,
            priority: true,
            dueDate: true,
            assignee: { select: { id: true, fullName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    const attachments = await this.getProjectFiles(id);
    const [withStatus] = await this.withQsStatuses([project]);
    return { ...withStatus, attachments };
  }

  async findByProjectNo(projectNo: string, currentUserId?: string, currentUserRole?: string) {
    const value = (projectNo ?? '').trim();
    if (!value) throw new NotFoundException('Project not found');

    const exact = await this.prisma.project.findFirst({
      where: { projectNo: value },
      select: PROJECT_SELECT,
    });
    if (exact) {
      await this.assertProjectAccess(exact.id, currentUserId, currentUserRole);
      const [withStatus] = await this.withQsStatuses([exact]);
      return withStatus;
    }

    const normalized = value.toLowerCase().replace(/[\s-]/g, '');
    const candidates = await this.prisma.project.findMany({
      where: { projectNo: { not: null } },
      select: PROJECT_SELECT,
      take: 5000,
    });
    const normalizedMatch =
      candidates.find(
        (project) =>
          (project.projectNo ?? '')
            .toLowerCase()
            .replace(/[\s-]/g, '') === normalized,
      ) ?? null;
    if (normalizedMatch) {
      const [withStatus] = await this.withQsStatuses([normalizedMatch]);
      return withStatus;
    }

    // Fallback: if project exists in ERP master tables but not yet hydrated
    // into ErpTSProject, create it on-demand so details page can resolve.
    const projectCode = value.trim();
    const erpRows = await this.prisma.live.$queryRaw<
      Array<{
        projectCode: string | null;
        projectName: string | null;
        businessUnitCode: string | null;
        salesPerson: string | null;
      }>
    >(Prisma.sql`
      SELECT TOP 1
        mp.projectCode,
        mp.projectName,
        mb.businessUnitCode,
        (me.firstName + '' + me.lastName) AS salesPerson
      FROM ErpMasterProject mp
      LEFT JOIN ErpMasterOpportunity mo ON mo.projectid = mp.projectid
      LEFT JOIN ErpMasterBusinessUnit mb ON mb.businessUnitId = mp.businessUnitId
      LEFT JOIN ErpMasterEmployee me ON me.employeeId = mo.salesRepId
      WHERE mp.isActive = 1
        AND (
          mp.projectCode = ${projectCode}
          OR REPLACE(REPLACE(LOWER(mp.projectCode), ' ', ''), '-', '') = REPLACE(REPLACE(LOWER(${projectCode}), ' ', ''), '-', '')
        )
      ORDER BY mp.createdOn DESC
    `);

    const erp = erpRows[0];
    if (erp?.projectCode) {
      const bu = String(erp.businessUnitCode ?? '').trim().toLowerCase();
      const category = bu === 'retail' || bu === 'rtl' || bu === 'r' ? 'Retail' : 'Project';

      try {
        const created = await this.prisma.project.create({
          data: {
            projectNo: erp.projectCode,
            name: erp.projectName?.trim() || erp.projectCode,
            category,
            businessUnit: erp.businessUnitCode?.trim() || category,
            status: 'ACTIVE',
            salesPerson: erp.salesPerson?.trim() || null,
            description: null,
          },
          select: PROJECT_SELECT,
        });
        await this.assignProjectToQsTeam(created.id, null, {
          name: created.name,
          projectNo: created.projectNo,
        });
        await this.assertProjectAccess(created.id, currentUserId, currentUserRole);
        const [withStatus] = await this.withQsStatuses([created]);
        return withStatus;
      } catch {
        const existingAfterRace = await this.prisma.project.findFirst({
          where: { projectNo: erp.projectCode },
          select: PROJECT_SELECT,
        });
        if (existingAfterRace) {
          await this.assertProjectAccess(existingAfterRace.id, currentUserId, currentUserRole);
          const [withStatus] = await this.withQsStatuses([existingAfterRace]);
          return withStatus;
        }
      }
    }

    throw new NotFoundException('Project not found');
  }

  async uploadProjectFile(projectId: string, file: Express.Multer.File, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new NotFoundException('Project not found');

    const uploaded = await this.taskFilesService.uploadTaskFile(file, userId);
    const created = await this.prisma.projectAttachment.create({
      data: {
        projectId,
        fileKey: uploaded.key,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.size,
        uploadedById: userId,
      },
      select: {
        id: true,
        fileKey: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    const signedUrl = await this.taskFilesService.createSignedReadUrl(created.fileKey);
    await this.activityLogger.log({
      action: ActivityAction.PROJECT_FILE_UPLOADED,
      userId,
      taskId: null,
      details: {
        event: ActivityAction.PROJECT_FILE_UPLOADED,
        messageKey: 'project_file_uploaded',
        projectSnapshot: {
          id: projectId,
          projectNo: undefined,
          name: undefined,
        },
        fileMeta: {
          id: created.id,
          fileName: created.fileName,
          fileKey: created.fileKey,
          mimeType: created.mimeType,
          sizeBytes: typeof created.sizeBytes === 'bigint' ? Number(created.sizeBytes) : created.sizeBytes,
        },
        context: { source: 'projects.uploadFile', projectId },
      },
    });
    return {
      ...created,
      sizeBytes: typeof created.sizeBytes === 'bigint' ? Number(created.sizeBytes) : created.sizeBytes,
      signedUrl,
    };
  }

  async addProjectFileLink(projectId: string, dto: CreateProjectFileLinkDto, userId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new NotFoundException('Project not found');

    const fileKey = String(dto.url ?? '').trim();
    const fileName = String(dto.fileName ?? '').trim();
    const created = await this.prisma.projectAttachment.create({
      data: {
        projectId,
        fileKey,
        fileName,
        mimeType: null,
        sizeBytes: null,
        uploadedById: userId,
      },
      select: {
        id: true,
        fileKey: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
    await this.activityLogger.log({
      action: ActivityAction.PROJECT_FILE_UPLOADED,
      userId,
      taskId: null,
      details: {
        event: ActivityAction.PROJECT_FILE_UPLOADED,
        messageKey: 'project_file_uploaded',
        projectSnapshot: {
          id: projectId,
          projectNo: undefined,
          name: undefined,
        },
        fileMeta: {
          id: created.id,
          fileName: created.fileName,
          fileKey: created.fileKey,
          mimeType: created.mimeType,
          sizeBytes: null,
        },
        context: { source: 'projects.addFileLink', projectId, external: true },
      },
    });
    return {
      ...created,
      sizeBytes: null,
      signedUrl: fileKey,
    };
  }

  async getProjectFiles(projectId: string, currentUserId?: string, currentUserRole?: string) {
    await this.assertProjectAccess(projectId, currentUserId, currentUserRole);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new NotFoundException('Project not found');

    const files = await this.prisma.projectAttachment.findMany({
      where: { projectId },
      select: {
        id: true,
        fileKey: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      files.map(async (file: (typeof files)[number]) => ({
        ...file,
        sizeBytes: typeof file.sizeBytes === 'bigint' ? Number(file.sizeBytes) : file.sizeBytes,
        signedUrl: this.isAbsoluteHttpUrl(file.fileKey)
          ? file.fileKey
          : await this.taskFilesService.createSignedReadUrl(file.fileKey),
      })),
    );
  }

  async removeProjectFile(projectId: string, fileId: string, userId: string) {
    const existing = await this.prisma.projectAttachment.findFirst({
      where: { id: fileId, projectId },
      select: { id: true, fileName: true, fileKey: true, mimeType: true, sizeBytes: true },
    });
    if (!existing) throw new NotFoundException('Project attachment not found');
    if (!this.isAbsoluteHttpUrl(existing.fileKey)) {
      await this.taskFilesService.deleteObjectByKey(existing.fileKey);
    }
    const deleted = await this.prisma.projectAttachment.delete({ where: { id: fileId } });
    await this.activityLogger.log({
      action: ActivityAction.PROJECT_FILE_DELETED,
      userId,
      taskId: null,
      details: {
        event: ActivityAction.PROJECT_FILE_DELETED,
        messageKey: 'project_file_deleted',
        projectSnapshot: {
          id: projectId,
          projectNo: undefined,
          name: undefined,
        },
        fileMeta: {
          id: existing.id,
          fileName: existing.fileName,
          fileKey: existing.fileKey,
          mimeType: existing.mimeType,
          sizeBytes:
            typeof existing.sizeBytes === 'bigint' ? Number(existing.sizeBytes) : existing.sizeBytes,
        },
        context: { source: 'projects.removeFile', projectId },
      },
    });
    return deleted;
  }

  async update(id: string, dto: UpdateProjectDto) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');

    return this.prisma.project.update({
      where: { id },
      data: {
        ...dto,
        technicalHead: dto.technicalHead !== undefined ? (dto.technicalHead?.trim() || null) : undefined,
        teamLead: dto.teamLead !== undefined ? (dto.teamLead?.trim() || null) : undefined,
        subTeamLead: dto.subTeamLead !== undefined ? (dto.subTeamLead?.trim() || null) : undefined,
        designers: dto.designers !== undefined ? (dto.designers?.trim() || null) : undefined,
      },
      select: PROJECT_SELECT,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');
    return this.prisma.project.delete({ where: { id } });
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

    await this.prisma.$executeRaw(Prisma.sql`
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
            source: 'projects.assignProjectToQsTeam',
          },
        },
      });
    }
  }

  private async getAssignedProjectIdsForQsUser(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ projectId: string }>>(Prisma.sql`
      SELECT [projectId] AS [projectId]
      FROM [ErpTSProjectQsAssignment]
      WHERE [qsUserId] = ${userId}
    `);
    return rows.map((row) => row.projectId);
  }

  private async assertProjectAccess(projectId: string, currentUserId?: string, currentUserRole?: string) {
    if (currentUserRole !== UserRole.QS) return;
    if (!currentUserId) throw new ForbiddenException('QS access requires an authenticated user');
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT TOP 1 [id] AS [id]
      FROM [ErpTSProjectQsAssignment]
      WHERE [projectId] = ${projectId}
        AND [qsUserId] = ${currentUserId}
    `);
    if (rows.length === 0) {
      throw new ForbiddenException('QS users can only access assigned projects');
    }
  }

  // ─── Sign Rows (project-scoped) ───────────────────────────────────────────

  private async getProjectQsStatus(projectId: string) {
    await this.ensureQsStatusTable();
    const rows = await this.prisma.$queryRaw<Array<{
      projectId: string; status: string; updatedById: string | null;
      submittedById: string | null; submittedAt: Date | null; createdAt: Date; updatedAt: Date;
    }>>(Prisma.sql`
      SELECT TOP 1 [projectId],[status],[updatedById],[submittedById],[submittedAt],[createdAt],[updatedAt]
      FROM [dbo].[ErpTSProjectQsStatus] WHERE [projectId] = ${projectId}
    `);
    const row = rows[0];
    if (!row) return { projectId, status: QS_STATUS_PENDING, updatedById: null, submittedById: null, submittedAt: null, createdAt: null, updatedAt: null };
    return { ...row, status: this.normalizeQsStatus(row.status) };
  }

  private async setProjectQsStatus(projectId: string, status: QsStatusValue, userId?: string) {
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
      WHEN NOT MATCHED THEN INSERT ([projectId],[status],[updatedById],[submittedById],[submittedAt])
        VALUES (
          ${projectId}, ${status}, ${userId ?? null},
          CASE WHEN ${status} = 'Completed' THEN ${userId ?? null} ELSE NULL END,
          CASE WHEN ${status} = 'Completed' THEN SYSUTCDATETIME() ELSE NULL END
        );
    `);
    return this.getProjectQsStatus(projectId);
  }

  private normalizeSignRowsDto(dto: SaveSignRowsDto) {
    if (!Array.isArray(dto.rows)) throw new BadRequestException('Sign rows payload is required');
    return dto.rows.map((row) => ({
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
      signFamily: row.signFamily?.trim() || null,
    }));
  }

  private hasSignRowChanges(before: any, after: Record<string, unknown>) {
    return SIGN_ROW_FIELDS.some((f) => (before?.[f] ?? null) !== (after[f] ?? null));
  }

  async getSignRows(projectId: string, userId?: string, role?: UserRole) {
    await this.assertProjectAccess(projectId, userId, role);
    return this.prisma.projectSignRow.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  }

  async getQsStatus(projectId: string, userId?: string, role?: UserRole) {
    await this.assertProjectAccess(projectId, userId, role);
    return this.getProjectQsStatus(projectId);
  }

  async updateQsStatus(projectId: string, dto: UpdateQsStatusDto, userId?: string, role?: UserRole) {
    await this.assertProjectAccess(projectId, userId, role);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, projectNo: true, name: true } });
    if (!project) throw new NotFoundException('Project not found');
    const previous = await this.getProjectQsStatus(projectId);
    const nextStatus = this.normalizeQsStatus(dto.status) as QsStatusValue;
    const next = await this.setProjectQsStatus(projectId, nextStatus, userId);
    if (userId && previous.status !== next.status) {
      await this.activityLogger.log({
        action: ActivityAction.QS_STATUS_CHANGED,
        userId,
        details: {
          event: ActivityAction.QS_STATUS_CHANGED,
          messageKey: 'qs_status_changed',
          projectSnapshot: { id: project.id, projectNo: project.projectNo, name: project.name },
          changes: { oldStatus: previous.status, newStatus: next.status },
          context: { source: 'projects.updateQsStatus', note: dto.note ?? null },
        },
      });
    }
    return next;
  }

  async saveSignRows(projectId: string, dto: SaveSignRowsDto, userId?: string, role?: UserRole) {
    await this.assertProjectAccess(projectId, userId, role);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, projectNo: true, name: true } });
    if (!project) throw new NotFoundException('Project not found');
    const currentStatus = await this.getProjectQsStatus(projectId);
    if (currentStatus.status === QS_STATUS_COMPLETED) {
      throw new BadRequestException('Completed QS projects are read-only.');
    }
    const rowsToPersist = this.normalizeSignRowsDto(dto);
    const existingRows = await this.prisma.projectSignRow.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
    const existingById = new Map(existingRows.map((r) => [r.id, r]));
    const incomingIds = new Set(rowsToPersist.map((r) => r.id).filter(Boolean));

    const savedRows = await this.prisma.$transaction(async (tx) => {
      for (const row of rowsToPersist) {
        const { id, ...data } = row;
        if (id && existingById.has(id)) {
          if (this.hasSignRowChanges(existingById.get(id), data)) {
            await tx.projectSignRow.update({ where: { id }, data });
          }
        } else {
          await tx.projectSignRow.create({ data: { projectId, ...data } });
        }
      }
      for (const row of existingRows) {
        if (!incomingIds.has(row.id)) {
          await tx.projectSignRow.delete({ where: { id: row.id } });
        }
      }
      return tx.projectSignRow.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
    });

    if (userId) {
      await this.activityLogger.log({
        action: ActivityAction.SIGN_FAMILY_UPDATED,
        userId,
        details: {
          event: ActivityAction.SIGN_FAMILY_UPDATED,
          messageKey: 'sign_family_updated',
          projectSnapshot: { id: project.id, projectNo: project.projectNo, name: project.name },
          context: { source: 'projects.saveSignRows', rowCount: savedRows.length },
        },
      });
    }

    const nextStatus = savedRows.length > 0 ? QS_STATUS_IN_PROGRESS : QS_STATUS_PENDING;
    if (currentStatus.status !== nextStatus) {
      await this.setProjectQsStatus(projectId, nextStatus, userId);
    }

    return savedRows;
  }

  async submitQsUpdate(projectId: string, dto: SaveSignRowsDto, userId?: string, role?: UserRole) {
    if (!userId) throw new ForbiddenException('QS submission requires an authenticated user');
    await this.assertProjectAccess(projectId, userId, role);
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { id: true, projectNo: true, name: true } });
    if (!project) throw new NotFoundException('Project not found');
    const previousStatus = await this.getProjectQsStatus(projectId);
    if (previousStatus.status === QS_STATUS_COMPLETED) {
      throw new BadRequestException('This QS project has already been submitted and is read-only.');
    }
    const savedRows = await this.saveSignRows(projectId, { rows: dto.rows }, userId, role);
    const nextStatus = await this.setProjectQsStatus(projectId, QS_STATUS_COMPLETED, userId);
    await this.activityLogger.log({
      action: ActivityAction.QS_UPDATE_SUBMITTED,
      userId,
      details: {
        event: ActivityAction.QS_UPDATE_SUBMITTED,
        messageKey: 'qs_update_submitted',
        projectSnapshot: { id: project.id, projectNo: project.projectNo, name: project.name },
        changes: { rowCount: savedRows.length, oldStatus: previousStatus.status, newStatus: nextStatus.status },
        context: { source: 'projects.submitQsUpdate', submittedByRole: role ?? null },
      },
    });

    const hodUsers = await this.prisma.user.findMany({ where: { role: { name: { in: ['HOD', 'ADMIN'] } } }, select: { id: true } });
    const message = `${project.projectNo ? `${project.projectNo} — ` : ''}${project.name} QS update submitted with ${savedRows.length} sign row(s).`;
    for (const hod of hodUsers) {
      this.notificationsService
        .create({ userId: hod.id, title: 'QS Update Submitted', message, linkUrl: `/project-task-creation/${project.projectNo}?from=projects-list&projectCode=${project.projectNo}&designType=Project` })
        .catch(() => {});
      this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
    }

    return { status: nextStatus.status, qsStatus: nextStatus, rows: savedRows };
  }
}
