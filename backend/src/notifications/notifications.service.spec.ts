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
    await service.findForUser(userId, '500');
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );

    jest.clearAllMocks();
    await service.findForUser(userId, '-5');
    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 }),
    );
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

  it('existsToday checks notifications created since midnight', async () => {
    prisma.notification.count.mockResolvedValue(1);
    await expect(service.existsToday(userId, 'Title', '/link')).resolves.toBe(true);
    expect(prisma.notification.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId,
          title: 'Title',
          linkUrl: '/link',
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );
  });
});
