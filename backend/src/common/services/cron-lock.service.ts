import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const APPLOCK_ACQUIRED = 0;
const APPLOCK_GRANTED_AFTER_WAIT = 1;

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
   * Attempt to acquire a cron lock. Returns a release function, or null if already held.
   */
  async tryAcquire(
    resource: string,
    options: { waitMs?: number } = {},
  ): Promise<(() => Promise<void>) | null> {
    if (this.inProcessLocks.has(resource)) {
      return null;
    }

    const waitMs = options.waitMs ?? 0;
    const acquired = await this.trySqlAppLock(resource, waitMs);
    if (!acquired) {
      return null;
    }

    this.inProcessLocks.add(resource);
    return async () => {
      this.inProcessLocks.delete(resource);
      await this.releaseSqlAppLock(resource);
    };
  }

  private async trySqlAppLock(resource: string, waitMs: number): Promise<boolean> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ result: number }>>(Prisma.sql`
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

  private async releaseSqlAppLock(resource: string): Promise<void> {
    try {
      await this.prisma.$executeRaw(Prisma.sql`
        EXEC sp_releaseapplock @Resource = ${resource}, @LockOwner = 'Session';
      `);
    } catch (err) {
      this.logger.warn(
        `Failed to release SQL app lock "${resource}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
