import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UserRole } from '../common/constants/roles.enum';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTaskDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.task.create({
      data: {
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        projectId: dto.projectId,
      },
    });
  }

  findAll(userId: string, role: UserRole, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return this.prisma.task.findMany({
      where: role === UserRole.HOD ? {} : { assigneeId: userId },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });
  }

  async update(id: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }
    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  async assign(id: string, dto: AssignTaskDto) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
    if (!assignee) {
      throw new NotFoundException('Assignee not found');
    }

    return this.prisma.task.update({
      where: { id },
      data: {
        assigneeId: dto.assigneeId,
      },
    });
  }

  async updateStatus(id: string, userId: string, role: UserRole, dto: UpdateTaskStatusDto) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Task not found');
    }
    if (role === UserRole.DESIGNER && existing.assigneeId !== userId) {
      throw new ForbiddenException('Designers can only update assigned task status');
    }

    return this.prisma.task.update({
      where: { id },
      data: { status: dto.status },
    });
  }
}
