import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(userId: string, role: string) {
    const isDesigner = role === 'DESIGNER';
    const taskWhere = isDesigner ? { assigneeId: userId } : {};

    const [totalTasks, totalProjects, taskStatusGroup] = await Promise.all([
      this.prisma.task.count({ where: taskWhere }),
      this.prisma.project.count(), // HOD can see all projects or you could filter
      this.prisma.task.groupBy({
        by: ['status'],
        where: taskWhere,
        _count: { status: true },
      }),
    ]);

    const statuses = taskStatusGroup.reduce((acc, curr) => {
      acc[curr.status] = curr._count.status;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalTasks,
      totalProjects,
      tasksByStatus: statuses,
      activeTasks: (statuses['PENDING'] || 0) + (statuses['WIP'] || 0) + (statuses['REVISION'] || 0),
      completedTasks: statuses['COMPLETED'] || 0,
      approvedTasks: statuses['APPROVED'] || 0,
    };
  }
}
