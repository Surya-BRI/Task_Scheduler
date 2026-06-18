import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DeadlineAlertsService {
  private readonly logger = new Logger(DeadlineAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 6 * * *')
  async checkDeadlines() {
    this.logger.log('Running deadline alerts check');
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const hodUsers = await this.prisma.user.findMany({
      where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
      select: { id: true },
    });

    const alerts = [
      {
        title: 'Task Due Tomorrow',
        where: { dueDate: { gte: now, lt: tomorrow } },
      },
      {
        title: 'Task Overdue',
        where: { dueDate: { lt: now } },
      },
    ] as const;

    for (const alert of alerts) {
      const tasks = await this.prisma.task.findMany({
        where: {
          ...alert.where,
          status: { notIn: ['CLIENT_ACCEPTED', 'CLIENT_REJECTED', 'COMPLETED', 'APPROVED'] },
          dueDate: { not: null },
        },
        select: {
          id: true,
          taskNo: true,
          designType: true,
          dueDate: true,
          assigneeId: true,
          project: { select: { name: true } },
        },
      });

      for (const task of tasks) {
        const linkUrl =
          task.designType?.toLowerCase() === 'retail'
            ? `/retail-task-view/${task.id}`
            : `/project-task-view/${task.id}`;

        const dueDateStr = task.dueDate!.toLocaleDateString('en-GB');
        const message = `${task.taskNo} — ${task.project?.name ?? 'Unknown Project'} deadline: ${dueDateStr}`;

        const recipients = new Set<string>();
        if (task.assigneeId) recipients.add(task.assigneeId);
        hodUsers.forEach((u) => recipients.add(u.id));

        for (const userId of recipients) {
          const alreadySent = await this.notificationsService.existsToday(userId, alert.title, linkUrl);
          if (!alreadySent) {
            await this.notificationsService.create({ userId, title: alert.title, message, linkUrl });
          }
        }
      }

      this.logger.log(`[${alert.title}] processed ${tasks.length} tasks`);
    }
  }
}
