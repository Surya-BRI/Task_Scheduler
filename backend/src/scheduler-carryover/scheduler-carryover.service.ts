import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CronLockService, LOCK_NOT_ACQUIRED } from '../common/services/cron-lock.service';
import { SchedulerAssignmentsService } from '../scheduler-assignments/scheduler-assignments.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../common/constants/roles.enum';

const CARRYOVER_CRON_LOCK = 'TaskScheduler:SchedulerCarryoverCron';

@Injectable()
export class SchedulerCarryoverService {
  private readonly logger = new Logger(SchedulerCarryoverService.name);
  private cronRunning = false;

  constructor(
    private readonly schedulerAssignmentsService: SchedulerAssignmentsService,
    private readonly cronLockService: CronLockService,
    private readonly usersService: UsersService,
  ) {}

  /** 06:20 GST daily — after the GST day fully ends, before HODs/designers start work. */
  @Cron('20 2 * * *')
  async runCarryoverCron(): Promise<void> {
    if (this.isCarryoverDisabled()) {
      this.logger.debug('Scheduler carryover skipped: CARRYOVER_ENABLED is off');
      return;
    }
    if (this.cronRunning) {
      this.logger.debug('Scheduler carryover skipped: previous run still in progress');
      return;
    }

    this.cronRunning = true;
    try {
      const result = await this.cronLockService.withLock(
        CARRYOVER_CRON_LOCK,
        () => this.runCarryoverScan(),
        { maxWaitMs: 20_000, timeoutMs: 10 * 60_000 },
      );
      if (result === LOCK_NOT_ACQUIRED) {
        this.logger.debug('Scheduler carryover skipped: lock held by another instance (or pool busy)');
      }
    } finally {
      this.cronRunning = false;
    }
  }

  private isCarryoverDisabled(): boolean {
    const raw = String(process.env.CARRYOVER_ENABLED ?? 'true').trim().toLowerCase();
    return raw === '0' || raw === 'false' || raw === 'off' || raw === 'no';
  }

  private async runCarryoverScan(): Promise<void> {
    const actorUserId = await this.resolveActorUserId();
    if (!actorUserId) {
      this.logger.warn('Scheduler carryover skipped: no HOD/Admin user found to act as system actor');
      return;
    }

    const result = await this.schedulerAssignmentsService.carryOverPastDueAssignments(actorUserId);
    if (result.processedGroups > 0 || result.skippedGroups > 0) {
      this.logger.log(
        `Scheduler carryover: processed=${result.processedGroups}, skipped=${result.skippedGroups}, ` +
          `moved=${result.movedCount}, unplacedHours=${result.totalUnplacedHours}, weeks=${result.affectedWeeks.join(', ')}`,
      );
    }
  }

  /** Background writes need a real actor id for assignedBy/changedBy — fall back to the first HOD/Admin, same as deadline-alerts.service.ts. */
  private async resolveActorUserId(): Promise<string | null> {
    const users = await this.usersService.findAll();
    const managementUser = users.find(
      (user) => user.role === UserRole.HOD || (user.role as string) === 'ADMIN',
    );
    return managementUser?.id ?? null;
  }
}
