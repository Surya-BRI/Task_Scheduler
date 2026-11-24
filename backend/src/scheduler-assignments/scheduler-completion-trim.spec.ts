import { SchedulerAssignmentsService } from './scheduler-assignments.service';
import { installBigIntJsonSerialization } from '../common/utils/json-serialization.util';

// main.ts installs this at boot; history JSON contains bigint designer ids.
installBigIntJsonSerialization();

/**
 * Rule 16 — early completion trims the task's scheduled rows on days after the completion day.
 * In-memory fake of the few Prisma calls trimScheduleAfterDesignCompletion uses.
 */
describe('SchedulerAssignmentsService.trimScheduleAfterDesignCompletion', () => {
  const TASK = 'task-1';
  const WEEK = new Date('2026-11-16T00:00:00.000Z'); // Mon
  const NEXT_WEEK = new Date('2026-11-23T00:00:00.000Z');

  type Row = {
    id: string;
    taskId: string;
    designerId: bigint;
    weekStartDate: Date;
    dayIndex: number;
    assignedHours: number;
    isLocked: boolean;
    parentId: string | null;
    splitIndex: number | null;
    totalParts: number | null;
    position: number;
  };

  let rows: Row[];
  let lockedWeeks: Date[];
  let prisma: any;
  let realtime: any;
  let service: SchedulerAssignmentsService;

  const row = (id: string, weekStartDate: Date, dayIndex: number, extra: Partial<Row> = {}): Row => ({
    id,
    taskId: TASK,
    designerId: 7n,
    weekStartDate,
    dayIndex,
    assignedHours: 4,
    isLocked: false,
    parentId: TASK,
    splitIndex: null,
    totalParts: null,
    position: 0,
    ...extra,
  });

  const sortRows = (list: Row[]) =>
    [...list].sort(
      (a, b) =>
        a.weekStartDate.getTime() - b.weekStartDate.getTime() || a.dayIndex - b.dayIndex || a.position - b.position,
    );

  beforeEach(() => {
    lockedWeeks = [];
    prisma = {
      schedulerAssignment: {
        findMany: jest.fn(async ({ where }: any) => {
          if (where?.weekStartDate?.in) {
            const keys = new Set(where.weekStartDate.in.map((d: Date) => d.getTime()));
            return sortRows(rows.filter((r) => keys.has(r.weekStartDate.getTime())));
          }
          if (where?.id?.notIn) {
            const skip = new Set(where.id.notIn);
            return sortRows(rows.filter((r) => r.taskId === where.taskId && !skip.has(r.id)));
          }
          return sortRows(
            rows.filter(
              (r) => r.taskId === where.taskId && r.weekStartDate.getTime() >= where.weekStartDate.gte.getTime(),
            ),
          );
        }),
        deleteMany: jest.fn(async ({ where }: any) => {
          const ids = new Set(where.id.in);
          rows = rows.filter((r) => !ids.has(r.id));
          return { count: ids.size };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const target = rows.find((r) => r.id === where.id)!;
          Object.assign(target, data);
          return target;
        }),
      },
      schedulerWeek: {
        findMany: jest.fn(async ({ where }: any) =>
          lockedWeeks
            .filter((w) => where.weekStartDate.in.some((d: Date) => d.getTime() === w.getTime()))
            .map((w) => ({ weekStartDate: w })),
        ),
        findUnique: jest.fn(async () => ({ version: 3 })),
        update: jest.fn(),
        create: jest.fn(),
      },
      schedulerAssignmentHistory: { create: jest.fn() },
      $executeRaw: jest.fn(async () => 0),
      $transaction: jest.fn((cb: (tx: any) => Promise<unknown>) => cb(prisma)),
    };
    realtime = { notifyOverviewRefresh: jest.fn() };
    service = new SchedulerAssignmentsService(
      prisma,
      {} as any,
      { log: jest.fn() } as any,
      { create: jest.fn() } as any,
      {} as any,
      realtime,
      undefined,
    );
  });

  // Tue 17-Nov 10:00 UTC = 14:00 GST → completion day is Tue (dayIndex 1).
  const completedAt = new Date('2026-11-17T10:00:00.000Z');

  it('removes rows after the completion day and keeps the completion day', async () => {
    rows = [
      row('tue', WEEK, 1, { splitIndex: 1, totalParts: 4 }),
      row('wed', WEEK, 2, { splitIndex: 2, totalParts: 4 }),
      row('thu', WEEK, 3, { splitIndex: 3, totalParts: 4 }),
      row('fri', WEEK, 4, { splitIndex: 4, totalParts: 4 }),
    ];

    const result = await service.trimScheduleAfterDesignCompletion(TASK, completedAt, '1');

    expect(result).toEqual({ removedCount: 3, removedHours: 12, affectedWeeks: ['2026-11-16'] });
    expect(rows.map((r) => r.id)).toEqual(['tue']);
    // Single survivor is no longer a split.
    expect(rows[0]).toMatchObject({ splitIndex: null, totalParts: null, parentId: null });
    expect(prisma.schedulerAssignmentHistory.create).toHaveBeenCalledTimes(1);
    expect(prisma.schedulerWeek.update).toHaveBeenCalledTimes(1);
    expect(realtime.notifyOverviewRefresh).toHaveBeenCalledWith(
      'scheduler_completion_trimmed',
      expect.objectContaining({ affectedWeekStarts: ['2026-11-16'], changedTaskIds: [TASK] }),
    );
  });

  it('keeps earlier days, renumbers survivors, and leaves locked rows alone', async () => {
    rows = [
      row('mon', WEEK, 0, { splitIndex: 1, totalParts: 4 }),
      row('tue', WEEK, 1, { splitIndex: 2, totalParts: 4 }),
      row('wed-logged', WEEK, 2, { splitIndex: 3, totalParts: 4, isLocked: true }),
      row('thu', WEEK, 3, { splitIndex: 4, totalParts: 4 }),
    ];

    const result = await service.trimScheduleAfterDesignCompletion(TASK, completedAt, '1');

    expect(result.removedCount).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(['mon', 'tue', 'wed-logged']);
    // 3 survivors → batched CASE update renumbers them 1..3 of 3.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('skips rows in a locked week', async () => {
    lockedWeeks = [NEXT_WEEK];
    rows = [row('tue', WEEK, 1), row('wed', WEEK, 2), row('next-mon', NEXT_WEEK, 0)];

    const result = await service.trimScheduleAfterDesignCompletion(TASK, completedAt, '1');

    expect(result.removedCount).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(['tue', 'next-mon']);
  });

  it('does nothing when completion is on or after the last planned day', async () => {
    rows = [row('mon', WEEK, 0), row('tue', WEEK, 1)];

    const result = await service.trimScheduleAfterDesignCompletion(TASK, completedAt, '1');

    expect(result).toEqual({ removedCount: 0, removedHours: 0, affectedWeeks: [] });
    expect(prisma.schedulerAssignment.deleteMany).not.toHaveBeenCalled();
    expect(realtime.notifyOverviewRefresh).not.toHaveBeenCalled();
  });

  it('uses the GST calendar day (late-evening UTC completion counts as next GST day)', async () => {
    // Tue 21:30 UTC = Wed 01:30 GST → completion day Wed; only Thu is removed.
    rows = [row('tue', WEEK, 1), row('wed', WEEK, 2), row('thu', WEEK, 3)];

    const result = await service.trimScheduleAfterDesignCompletion(
      TASK,
      new Date('2026-11-17T21:30:00.000Z'),
      '1',
    );

    expect(result.removedCount).toBe(1);
    expect(rows.map((r) => r.id)).toEqual(['tue', 'wed']);
  });
});
