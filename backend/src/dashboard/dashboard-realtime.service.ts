import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '../common/constants/roles.enum';

export type DashboardRealtimeEvent =
  | 'task_created'
  | 'task_completed'
  | 'task_reassigned'
  | 'task_status_changed'
  | 'leave_approved'
  | 'leave_rejected'
  | 'overtime_approved'
  | 'overtime_rejected'
  | 'regularization_approved'
  | 'regularization_rejected'
  | 'chatter_post_created'
  | 'notification_created';

export interface DashboardRefreshPayload {
  event: DashboardRealtimeEvent;
  at: string;
}

type DashboardEmitter = {
  emitDashboardRefresh: (payload: DashboardRefreshPayload) => void;
  emitNotificationRefresh: (userId: string) => void;
};

const OVERVIEW_ROLES: UserRole[] = [UserRole.HOD];

@Injectable()
export class DashboardRealtimeService {
  private readonly logger = new Logger(DashboardRealtimeService.name);
  private emitter: DashboardEmitter | null = null;

  registerEmitter(emitter: DashboardEmitter) {
    this.emitter = emitter;
  }

  notifyOverviewRefresh(event: DashboardRealtimeEvent) {
    if (!this.emitter) return;
    try {
      this.emitter.emitDashboardRefresh({ event, at: new Date().toISOString() });
    } catch (err) {
      this.logger.warn(`Failed to emit dashboard refresh (${event}): ${(err as Error).message}`);
    }
  }

  notifyUserNotificationRefresh(userId: string) {
    if (!this.emitter || !userId) return;
    try {
      this.emitter.emitNotificationRefresh(userId);
    } catch (err) {
      this.logger.warn(`Failed to emit notification refresh: ${(err as Error).message}`);
    }
  }

  static overviewRoles(): UserRole[] {
    return OVERVIEW_ROLES;
  }
}
