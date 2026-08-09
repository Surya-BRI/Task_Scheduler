import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  };

  const service = new NotificationsService(prisma as never);
  const userId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('findForUser clamps limit between 1 and 100', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    await service.findForUser(userId, '500');
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );

    jest.clearAllMocks();
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    await service.findForUser(userId, '-5');
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it('findForUser treats an explicit limit of 0 as 0, not the 30 default', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    await service.findForUser(userId, '0');
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
  });

  it('findForUser returns data with unreadCount in one round-trip', async () => {
    const rows = [{ id: 'n1', isRead: false }];
    prisma.notification.findMany.mockResolvedValue(rows);
    prisma.notification.count.mockResolvedValue(4);
    await expect(service.findForUser(userId, '30')).resolves.toEqual({
      data: rows,
      unreadCount: 4,
    });
  });

  it('markRead updates only notifications owned by the user', async () => {
    const row = { id: 'n1', userId };
    prisma.notification.findFirst.mockResolvedValue(row);
    prisma.notification.update.mockResolvedValue({ ...row, isRead: true });

    await expect(service.markRead('n1', userId)).resolves.toEqual({ ...row, isRead: true });
    expect(prisma.notification.findFirst).toHaveBeenCalledWith({
      where: { id: 'n1', userId },
    });
  });

  it('markRead throws when notification belongs to another user', async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.markRead('n1', userId)).rejects.toThrow(NotFoundException);
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('markAllRead updates unread notifications for the user', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 3 });
    await expect(service.markAllRead(userId)).resolves.toEqual({ success: true });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  });

  it('existsToday checks notifications since 00:00 GST (not UTC midnight)', async () => {
    // 09 Aug 2026 02:00 UTC = 06:00 GST → GST day started 08 Aug 20:00 UTC
    jest.useFakeTimers({ now: new Date('2026-08-09T02:00:00.000Z') });
    prisma.notification.count.mockResolvedValue(1);

    await expect(service.existsToday(userId, 'Title', '/link')).resolves.toBe(true);

    expect(prisma.notification.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId,
          title: 'Title',
          linkUrl: '/link',
          createdAt: { gte: new Date('2026-08-08T20:00:00.000Z') },
        }),
      }),
    );
    jest.useRealTimers();
  });
});
