import { ActivitiesService } from './activities.service';
import { UserRole } from '../common/constants/roles.enum';

describe('ActivitiesService', () => {
  const prisma = {
    task: { findMany: jest.fn() },
    activityLog: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new ActivitiesService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries designer feed without invalid ActivityLog.projectId filter', async () => {
    await service.findAll({
      limit: 10,
      requestingUserId: '11111111-1111-4111-8111-111111111111',
      requestingUserRole: UserRole.DESIGNER,
    });

    expect(prisma.activityLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { task: { assigneeId: '11111111-1111-4111-8111-111111111111' } },
            { userId: '11111111-1111-4111-8111-111111111111' },
          ],
        },
      }),
    );
  });

  describe('overtime summaries', () => {
    it('formats submitted overtime with sender and recipient context', () => {
      const summary = (service as any).formatSummary(
        'OVERTIME_REQUEST_SUBMITTED',
        {
          messageKey: 'overtime_request_submitted',
          taskSnapshot: { taskNo: 'TSK-OP58199-20260604085458-55584' },
          context: { designerName: 'Alex Johnson', recipientName: 'Morgan Lee' },
        },
        'Alex Johnson',
      );

      expect(summary).toBe('Alex Johnson sent an overtime request to Morgan Lee');
    });

    it('formats approved overtime with reviewer and requester context', () => {
      const summary = (service as any).formatSummary(
        'OVERTIME_REQUEST_APPROVED',
        {
          messageKey: 'overtime_request_approved',
          context: { designerName: 'Alex Johnson', reviewerName: 'Morgan Lee' },
        },
        'Morgan Lee',
      );

      expect(summary).toBe('Morgan Lee accepted the overtime request from Alex Johnson');
    });
  });

  describe('chatter summaries', () => {
    it('includes task title for task chatter posts', () => {
      const summary = (service as any).formatSummary(
        'CREATED_CHATTER_POST',
        { messageKey: 'chatter_post_created' },
        'Sarah Mitchell',
        'Retail Signage Layout',
      );

      expect(summary).toBe('Sarah Mitchell posted in chatter on Task: Retail Signage Layout');
    });
  });
});
