import { DashboardRealtimeService } from './dashboard-realtime.service';

describe('DashboardRealtimeService', () => {
  it('merges delta fields into dashboard refresh payloads', () => {
    const emitted: unknown[] = [];
    const service = new DashboardRealtimeService();
    service.registerEmitter({
      emitDashboardRefresh: (payload) => emitted.push(payload),
      emitNotificationRefresh: () => {},
      emitChatterRefresh: () => {},
      emitTimerPaused: () => {},
    });

    service.notifyOverviewRefresh('scheduler_week_saved', {
      weekStart: '2026-07-06',
      version: 12,
      updatedBy: 'hod-1',
      changedTaskIds: ['task-1'],
    });

    expect(emitted[0]).toMatchObject({
      event: 'scheduler_week_saved',
      weekStart: '2026-07-06',
      version: 12,
      updatedBy: 'hod-1',
      changedTaskIds: ['task-1'],
    });
    expect((emitted[0] as { at: string }).at).toEqual(expect.any(String));
  });
});
