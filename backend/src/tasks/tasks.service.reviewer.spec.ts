import { TasksService } from './tasks.service';
import { ActivityAction } from '../activities/activity-events';

/**
 * Reviewer HOD label: any authorized reviewer may review a task; once the review is completed the
 * name shown is the person who actually did it, not the HOD originally assigned/named.
 */
describe('TasksService reviewer HOD label', () => {
  const statusMove = (userName: string, newStatus: string, oldStatus = 'HOD_REVIEW') => ({
    details: JSON.stringify({ changes: { oldStatus, newStatus } }),
    user: { userName },
  });

  function build(reviewMoves: unknown[]) {
    const prisma: any = {
      activityLog: {
        findFirst: jest.fn().mockResolvedValue({ user: { userName: 'creator' } }),
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where.action === ActivityAction.STATUS_CHANGED ? reviewMoves : []),
        ),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const service = new TasksService(prisma, {} as any, {} as any, {} as any, undefined);
    return (task: object) => (service as any).getTaskPeopleLabels('task-1', task);
  }

  const task = { technicalHead: null, retailDetails: [{ hodName: 'Assigned Hod' }] };

  it('shows the assigned HOD while the review has not been completed', async () => {
    const labels = await build([])(task);
    expect(labels.reviewerHodName).toBe('Assigned Hod');
  });

  it('shows the HOD who actually sent the task to Sales, not the assigned one', async () => {
    const labels = await build([statusMove('Other Hod', 'SALES_REVIEW')])(task);
    expect(labels.reviewerHodName).toBe('Other Hod');
  });

  it('shows whoever last completed the review (newest first) after a rework loop', async () => {
    const labels = await build([
      statusMove('Second Hod', 'SALES_REVIEW'),
      statusMove('First Hod', 'REWORK'),
    ])(task);
    expect(labels.reviewerHodName).toBe('Second Hod');
  });

  it('ignores moves out of HOD_REVIEW that are not a completed review (e.g. put on hold)', async () => {
    const labels = await build([statusMove('Someone', 'ON_HOLD')])(task);
    expect(labels.reviewerHodName).toBe('Assigned Hod');
  });

  it('shows an Admin who completed the review', async () => {
    const labels = await build([statusMove('Admin User', 'SALES_REVIEW')])(task);
    expect(labels.reviewerHodName).toBe('Admin User');
  });
});
