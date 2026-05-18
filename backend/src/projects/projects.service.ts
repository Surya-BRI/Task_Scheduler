import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { TaskFilesService } from '../tasks/task-files.service';

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
  ) {}

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
    return {
      ...created,
      sizeBytes: typeof created.sizeBytes === 'bigint' ? Number(created.sizeBytes) : created.sizeBytes,
      signedUrl,
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
        signedUrl: await this.taskFilesService.createSignedReadUrl(file.fileKey),
      })),
    );
  }

  async removeProjectFile(projectId: string, fileId: string) {
    const existing = await this.prisma.projectAttachment.findFirst({
      where: { id: fileId, projectId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Project attachment not found');
    return this.prisma.projectAttachment.delete({ where: { id: fileId } });
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
