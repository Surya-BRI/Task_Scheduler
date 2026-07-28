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
      emitTimerUpdated: () => {},
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

  it('emits timer:updated payloads for the designer room', () => {
    const updated: unknown[] = [];
    const service = new DashboardRealtimeService();
    service.registerEmitter({
      emitDashboardRefresh: () => {},
      emitNotificationRefresh: () => {},
      emitChatterRefresh: () => {},
      emitTimerPaused: () => {},
      emitTimerUpdated: (_userId, payload) => updated.push(payload),
    });

    service.notifyTimerUpdated('user-1', {
      taskId: 'task-1',
      accumulatedSeconds: 120,
      runStartedAt: '2026-07-24T10:00:00.000Z',
    });

    expect(updated[0]).toMatchObject({
      taskId: 'task-1',
      accumulatedSeconds: 120,
      runStartedAt: '2026-07-24T10:00:00.000Z',
    });
    expect((updated[0] as { at: string }).at).toEqual(expect.any(String));
  });
});
