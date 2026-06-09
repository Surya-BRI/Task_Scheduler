import { ActivitiesService } from './activities.service';

describe('ActivitiesService overtime summaries', () => {
  const service = new ActivitiesService({} as any);

  it('formats submitted overtime as actor + action only', () => {
    const summary = (service as any).formatSummary(
      'OVERTIME_REQUEST_SUBMITTED',
      {
        messageKey: 'overtime_request_submitted',
        taskSnapshot: { taskNo: 'TSK-OP58199-20260604085458-55584' },
        projectSnapshot: { name: 'Retail Revamp' },
        changes: { overtimeDate: '2026-06-03', requestedHours: '2' },
        context: { designerName: 'Alex Johnson' },
      },
      'Alex Johnson',
    );

    expect(summary).toBe('Alex Johnson submitted an overtime request');
  });

  it('formats approved overtime without extra detail', () => {
    const summary = (service as any).formatSummary(
      'OVERTIME_REQUEST_APPROVED',
      {
        messageKey: 'overtime_request_approved',
        taskSnapshot: { taskNo: 'T-001' },
        changes: { approvedHours: '1.5' },
        context: { designerName: 'Alex Johnson' },
      },
      'HOD User',
    );

    expect(summary).toBe('HOD User approved an overtime request');
  });
});
