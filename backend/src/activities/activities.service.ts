import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(limitParam: number = 50) {
    // Fetch latest activities from the Prisma ActivityLog model
    const activities = await this.prisma.activityLog.findMany({
      take: limitParam,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, fullName: true }
        },
        task: {
          select: { id: true, title: true, opNo: true, project: { select: { name: true } } }
        }
      }
    });

    return activities.map((act: any) => {
      let detailsObj: any = {};
      try {
        if (act.details) detailsObj = JSON.parse(act.details);
      } catch {
        detailsObj = {};
      }

      // Map to frontend expected shape somewhat
      return {
        id: act.id,
        kind: 'task_update', // Everything is mapped to task_update for now to fit the UI
        user: { 
          id: act.user.id, 
          name: act.user.fullName,
          avatarUrl: "https://ui-avatars.com/api/?name=" + encodeURIComponent(act.user.fullName) + "&background=random"
        },
        messageSegments: [
          { type: 'text', value: `${act.user.fullName} performed ${act.action} ` },
          ...(act.task ? [{ type: 'link', label: act.task.opNo || 'Task', href: `/tasks/${act.task.id}` }] : []),
          ...(detailsObj.title ? [{ type: 'text', value: ` on "${detailsObj.title}"` }] : [])
        ],
        occurredAt: act.createdAt.toISOString(),
        liked: false,
        individualEligible: true,
        monthIndex: act.createdAt.getMonth(),
        year: act.createdAt.getFullYear(),
        priority: "normal"
      };
    });
  }
}
