import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '../common/constants/roles.enum';

export type DashboardRealtimeEvent =
  | 'task_created'
  | 'task_completed'
  | 'task_reassigned'
  | 'task_status_changed'
  | 'leave_approved'
  | 'leave_rejected'
  | 'leave_revoked'
  | 'overtime_approved'
  | 'overtime_rejected'
  | 'overtime_scheduler_action'
  | 'scheduler_week_saved'
  | 'scheduler_leave_rescheduled'
  | 'scheduler_week_locked'
  | 'scheduler_week_unlocked'
  | 'regularization_approved'
  | 'regularization_rejected'
  | 'chatter_post_created'
  | 'chatter_updated'
  | 'notification_created';

export interface DashboardRefreshPayload {
  event: DashboardRealtimeEvent;
  at: string;
}

export interface ChatterRefreshPayload {
  event: 'chatter_post_created' | 'chatter_post_updated' | 'chatter_post_deleted' | 'chatter_comment_created' | 'chatter_comment_deleted';
  postId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  at: string;
}

type DashboardEmitter = {
  emitDashboardRefresh: (payload: DashboardRefreshPayload) => void;
  emitNotificationRefresh: (userId: string) => void;
  emitChatterRefresh: (payload: ChatterRefreshPayload) => void;
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

  notifyChatterRefresh(payload: ChatterRefreshPayload) {
    if (!this.emitter) return;
    try {
      this.emitter.emitChatterRefresh(payload);
    } catch (err) {
      this.logger.warn(`Failed to emit chatter refresh (${payload.event}): ${(err as Error).message}`);
    }
  }

  static overviewRoles(): UserRole[] {
    return OVERVIEW_ROLES;
  }
}
