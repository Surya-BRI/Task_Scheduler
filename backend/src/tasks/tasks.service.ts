import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UserRole } from '../common/constants/roles.enum';

const TASK_SELECT = {
  id: true,
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
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTaskDto) {
    const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
    if (!project) throw new NotFoundException('Project not found');

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }

    return this.prisma.task.create({
      data: {
        title: dto.title,
        opNo: dto.opNo,
        description: dto.description,
        priority: dto.priority ?? 'Medium',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        projectId: dto.projectId,
        assigneeId: dto.assigneeId ?? null,
      },
      select: TASK_SELECT,
    });
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

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, select: TASK_SELECT });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      select: TASK_SELECT,
    });
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
      // @ts-ignore: IDE cache issue
      await this.prisma.activityLog.create({
        data: {
          action: 'ASSIGNED_TASK',
          details: JSON.stringify({ title: updatedTask.title, newAssignee: assignee.fullName }),
          userId: dto.assigneeId, // Assuming assignee if we don't have acting user
          taskId: id,
        }
      });
    } catch (e) { }

    return updatedTask;
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
      // @ts-ignore: IDE cache issue
      await this.prisma.activityLog.create({
        data: {
          action: 'STATUS_CHANGED',
          details: JSON.stringify({ title: updatedTask.title, oldStatus: existing.status, newStatus: dto.status }),
          userId: userId,
          taskId: id,
        }
      });
    } catch (e) { }

    return updatedTask;
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
