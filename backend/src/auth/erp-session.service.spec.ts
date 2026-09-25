import { ErpSessionService } from './erp-session.service';

describe('ErpSessionService', () => {
  function makeService(updatedRows: number) {
    const tx = { $executeRaw: jest.fn().mockResolvedValueOnce(updatedRows).mockResolvedValue(1) };
    const prisma = { $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)) };
    return { service: new ErpSessionService(prisma as never), tx };
  }

  it('marks the session logged out and nulls the fcmToken, scoped to the caller', async () => {
    const { service, tx } = makeService(1);

    await expect(service.endSession(36891n, 3103n)).resolves.toBe(true);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const [sessionSql, ...sessionParams] = tx.$executeRaw.mock.calls[0];
    expect(sessionSql.join('?')).toContain('isLoggedOut = 1');
    expect(sessionSql.join('?')).toContain('loggedOut = DATEADD(HOUR, 4, GETUTCDATE())');
    expect(sessionParams).toEqual([36891n, 3103n]);
    const [fcmSql, ...fcmParams] = tx.$executeRaw.mock.calls[1];
    expect(fcmSql.join('?')).toContain('fcmToken = NULL');
    expect(fcmParams).toEqual([3103n]);
  });

  it("leaves the fcmToken alone when the session was already logged out or isn't the caller's", async () => {
    const { service, tx } = makeService(0);

    await expect(service.endSession(36891n, 3103n)).resolves.toBe(false);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
