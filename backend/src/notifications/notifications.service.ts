import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findForUser(userId: string, limitParam?: string) {
    const parsed = Number.parseInt(limitParam ?? '30', 10);
    const limit = Math.min(100, Math.max(1, Number.isNaN(parsed) ? 30 : parsed));
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markRead(id: string, userId: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markUnread(id: string, userId: string) {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: false },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { success: true };
  }

  async countUnread(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async create(data: { userId: string; title: string; message: string; linkUrl?: string }) {
    return this.prisma.notification.create({ data: { id: randomUUID(), ...data } });
  }

  // Returns true if the same userId+title+linkUrl notification was already sent today (UTC midnight reset —
  // createdAt is stored/compared in UTC throughout this codebase, so the boundary must match).
  async existsToday(userId: string, title: string, linkUrl: string): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const count = await this.prisma.notification.count({
      where: { userId, title, linkUrl, createdAt: { gte: startOfDay } },
    });
    return count > 0;
  }
}
