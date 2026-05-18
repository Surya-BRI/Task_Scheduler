import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ActivityActionType, ActivityDetailsPayload } from './activity-events';

@Injectable()
export class ActivityLoggerService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    action: ActivityActionType;
    userId: string;
    taskId?: string | null;
    details: ActivityDetailsPayload;
  }): Promise<void> {
    const { action, userId, taskId, details } = params;
    try {
      await this.prisma.activityLog.create({
        data: {
          action,
          userId,
          taskId: taskId ?? null,
          details: JSON.stringify(details),
        },
      });
    } catch {
      // Best-effort logging
    }
  }
}
