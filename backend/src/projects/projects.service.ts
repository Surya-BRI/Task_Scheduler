import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectFileLinkDto } from './dto/create-project-file-link.dto';
import { TaskFilesService } from '../tasks/task-files.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';

const PROJECT_SELECT = {
  id: true,
  projectNo: true,
  name: true,
  category: true,
  businessUnit: true,
  description: true,
  status: true,
  salesPerson: true,
  createdById: true,
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { tasks: true } },
  createdAt: true,
  updatedAt: true,
};

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
  ) {}

  private isAbsoluteHttpUrl(value: string) {
    return /^https?:\/\//i.test(String(value ?? '').trim());
  }

  create(createdById: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
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
  }

  async findAll(filters: ProjectFilters = {}) {
    const { status, category, search, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
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
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
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
    return { ...project, attachments };
  }

  async findByProjectNo(projectNo: string) {
    const value = (projectNo ?? '').trim();
    if (!value) throw new NotFoundException('Project not found');

    const exact = await this.prisma.project.findFirst({
      where: { projectNo: value },
      select: PROJECT_SELECT,
    });
    if (exact) return exact;

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
    if (normalizedMatch) return normalizedMatch;

    // Fallback: if project exists in ERP master tables but not yet hydrated
    // into ErpTSProject, create it on-demand so details page can resolve.
    const escaped = value.replace(/'/g, "''");
    const erpRows = await this.prisma.live.$queryRawUnsafe<
      Array<{
        projectCode: string | null;
        projectName: string | null;
        businessUnitCode: string | null;
        salesPerson: string | null;
      }>
    >(`
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
          mp.projectCode = '${escaped}'
          OR REPLACE(REPLACE(LOWER(mp.projectCode), ' ', ''), '-', '') = REPLACE(REPLACE(LOWER('${escaped}'), ' ', ''), '-', '')
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
        return created;
      } catch {
        const existingAfterRace = await this.prisma.project.findFirst({
          where: { projectNo: erp.projectCode },
          select: PROJECT_SELECT,
        });
        if (existingAfterRace) return existingAfterRace;
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

  async getProjectFiles(projectId: string) {
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
      data: dto,
      select: PROJECT_SELECT,
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.project.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Project not found');
    return this.prisma.project.delete({ where: { id } });
  }
}
