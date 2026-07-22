import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const APPLOCK_ACQUIRED = 0;
const APPLOCK_GRANTED_AFTER_WAIT = 1;

/** Returned by `withLock` when the lock is already held (in-process or by another instance). */
export const LOCK_NOT_ACQUIRED = Symbol('LOCK_NOT_ACQUIRED');

/**
 * Prevents overlapping cron runs across processes using SQL Server app locks,
 * with an in-process guard for same-instance overlap.
 */
@Injectable()
export class CronLockService {
  private readonly logger = new Logger(CronLockService.name);
  private readonly inProcessLocks = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `fn` while holding a cross-process SQL Server app lock on `resource`,
   * returning `fn`'s result, or `LOCK_NOT_ACQUIRED` if the lock is already held.
   *
   * Acquire, `fn`, and release all run inside one `$transaction` so they share
   * the same physical DB connection — `sp_getapplock`'s `@LockOwner = 'Session'`
   * ties the lock to whichever connection acquired it, and running acquire/release
   * as separate pooled calls (the previous `tryAcquire()` + detached release
   * closure design) let Prisma's connection pool hand them different physical
   * connections, causing "lock not currently held" release failures.
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options: { waitMs?: number; timeoutMs?: number } = {},
  ): Promise<T | typeof LOCK_NOT_ACQUIRED> {
    if (this.inProcessLocks.has(resource)) {
      return LOCK_NOT_ACQUIRED;
    }
    this.inProcessLocks.add(resource);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const acquired = await this.trySqlAppLock(tx, resource, options.waitMs ?? 0);
          if (!acquired) {
            return LOCK_NOT_ACQUIRED;
          }
          try {
            return await fn();
          } finally {
            await this.releaseSqlAppLock(tx, resource);
          }
        },
        { timeout: options.timeoutMs ?? 5 * 60_000 },
      );
    } finally {
      this.inProcessLocks.delete(resource);
    }
  }

  private async trySqlAppLock(tx: Prisma.TransactionClient, resource: string, waitMs: number): Promise<boolean> {
    try {
      const rows = await tx.$queryRaw<Array<{ result: number }>>(Prisma.sql`
        DECLARE @res INT;
        EXEC @res = sp_getapplock
          @Resource = ${resource},
          @LockMode = 'Exclusive',
          @LockOwner = 'Session',
          @LockTimeout = ${waitMs};
        SELECT @res AS result;
      `);
      const code = rows[0]?.result ?? -1;
      return code === APPLOCK_ACQUIRED || code === APPLOCK_GRANTED_AFTER_WAIT;
    } catch (err) {
      this.logger.warn(
        `SQL app lock unavailable for "${resource}" — falling back to in-process lock only: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return true;
    }
  }

  private async releaseSqlAppLock(tx: Prisma.TransactionClient, resource: string): Promise<void> {
    try {
      await tx.$executeRaw(Prisma.sql`
        EXEC sp_releaseapplock @Resource = ${resource}, @LockOwner = 'Session';
      `);
    } catch (err) {
      this.logger.warn(
        `Failed to release SQL app lock "${resource}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
