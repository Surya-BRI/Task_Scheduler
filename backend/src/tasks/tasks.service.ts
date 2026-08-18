import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UserRole } from '../common/constants/roles.enum';
import { CreateExtendedTaskDto } from './dto/create-extended-task.dto';
import { TaskFilesService } from './task-files.service';
import { ActivityLoggerService } from '../activities/activity-logger.service';
import { ActivityAction } from '../activities/activity-events';
import { SubmitWorkDto } from './dto/submit-work.dto';
import { SaveTimerStateDto } from './dto/save-timer-state.dto';
import { DashboardRealtimeService } from '../dashboard/dashboard-realtime.service';
import { COMPLETED_STATUS_FILTER, isTaskReassignmentBlocked, TASK_REASSIGNMENT_BLOCKED_MESSAGE } from '../dashboard/task-status-buckets.util';
import { toApiTaskStatus, toDbTaskStatus } from './task-status.util';
import { NotificationsService } from '../notifications/notifications.service';
import {
  mapSchedulerTaskSummary,
  SCHEDULER_TASK_SUMMARY_SELECT,
  schedulerQueueWhere,
  type SchedulerTaskSummaryDto,
} from './scheduler-task-summary.util';
import {
  effectiveWorkSessionSeconds,
  normalizeWorkSeconds,
  workedHoursFromSeconds,
} from '../common/utils/task-work-session-time.util';
import { utcDateOnlyString } from '../common/utils/date-window.util';
import { assertHoursWithinDeadline } from '../common/utils/task-deadline-hours.util';
import { summarizeViewerOvertimeHours } from './scheduler-overtime-hours.util';
import { taskViewPath } from '../common/utils/design-type.util';
import { matchSalesUsersToProject } from '../common/utils/sales-notification-recipients.util';

const TASK_ATTACHMENT_SELECT = {
  id: true,
  fileKey: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} as const;

const TASK_RETAIL_DETAIL_CORE_SELECT = {
  id: true,
  taskId: true,
  providedFile: true,
  hodName: true,
  designTypes: true,
  hoursRequired: true,
  comment: true,
  signFamily: true,
  signType: true,
  planCode: true,
  contractRef: true,
  quantity: true,
  deadline: true,
  createdAt: true,
} as const;

const TASK_PROJECT_DETAIL_CORE_SELECT = {
  id: true,
  taskId: true,
  signType: true,
  planCode: true,
  area: true,
  level: true,
  artwork: true,
  artworkHours: true,
  technical: true,
  technicalHours: true,
  location: true,
  locationHours: true,
  asBuilt: true,
  asBuiltHours: true,
  bim: true,
  deadline: true,
  comment: true,
  createdAt: true,
} as const;

/** Full task graph (detail lines + attachment metadata). Signed URLs added separately. */
const TASK_SELECT = {
  id: true,
  taskNo: true,
  opNo: true,
  title: true,
  revisionCode: true,
  designType: true,
  signType: true,
  signFamily: true,
  disciplineType: true,
  phase: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  holdPreviousStatus: true,
  reworkNote: true,
  reworkAttachmentUrl: true,
  reworkAttachmentName: true,
  reworkLinkUrl: true,
  reworkLinkName: true,
  previousRevisionTaskId: true,
  technicalHead: true,
  teamLead: true,
  subTeamLead: true,
  designers: true,
  projectId: true,
  project: {
    select: {
      id: true,
      name: true,
      projectNo: true,
      category: true,
      salesPerson: true,
      createdById: true,
    },
  },
  assigneeId: true,
  assignee: { select: { id: true, fullName: true, email: true } },
  taskDesigners: { select: { designer: { select: { id: true, fullName: true, email: true } } } },
  retailDetails: {
    select: {
      ...TASK_RETAIL_DETAIL_CORE_SELECT,
      attachments: { select: TASK_ATTACHMENT_SELECT },
    },
  },
  projectDetails: {
    select: {
      ...TASK_PROJECT_DETAIL_CORE_SELECT,
      attachments: { select: TASK_ATTACHMENT_SELECT },
    },
  },
  createdAt: true,
  updatedAt: true,
};

/**
 * Fast first-paint payload: scalars + people + detail lines, no attachment rows.
 * Attachments / signed URLs / scheduler / reallocation load via findOneExtras.
 */
const TASK_CORE_SELECT = {
  id: true,
  taskNo: true,
  opNo: true,
  title: true,
  revisionCode: true,
  designType: true,
  signType: true,
  signFamily: true,
  disciplineType: true,
  phase: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  holdPreviousStatus: true,
  reworkNote: true,
  reworkAttachmentUrl: true,
  reworkAttachmentName: true,
  reworkLinkUrl: true,
  reworkLinkName: true,
  previousRevisionTaskId: true,
  technicalHead: true,
  teamLead: true,
  subTeamLead: true,
  designers: true,
  projectId: true,
  project: {
    select: {
      id: true,
      name: true,
      projectNo: true,
      category: true,
      salesPerson: true,
      createdById: true,
    },
  },
  assigneeId: true,
  assignee: { select: { id: true, fullName: true, email: true } },
  taskDesigners: { select: { designer: { select: { id: true, fullName: true, email: true } } } },
  retailDetails: { select: TASK_RETAIL_DETAIL_CORE_SELECT },
  projectDetails: { select: TASK_PROJECT_DETAIL_CORE_SELECT },
  createdAt: true,
  updatedAt: true,
};

/** Slim row for PATCH /status — enough for notifications + UI status patch; no detail joins. */
const TASK_STATUS_SELECT = {
  id: true,
  taskNo: true,
  opNo: true,
  title: true,
  status: true,
  holdPreviousStatus: true,
  designType: true,
  assigneeId: true,
  reworkNote: true,
  reworkAttachmentUrl: true,
  reworkAttachmentName: true,
  reworkLinkUrl: true,
  reworkLinkName: true,
  project: {
    select: {
      id: true,
      name: true,
      projectNo: true,
      salesPerson: true,
      createdById: true,
    },
  },
} as const;

const PROJECT_LOOKUP_SELECT = {
  id: true,
  projectNo: true,
  name: true,
  category: true,
  businessUnit: true,
  description: true,
  status: true,
  salesPerson: true,
  technicalHead: true,
  teamLead: true,
  subTeamLead: true,
  designers: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
};

type ProjectLookup = Omit<
  Prisma.ProjectGetPayload<{ select: typeof PROJECT_LOOKUP_SELECT }>,
  'designers'
> & { designers: string | null };

const TASK_LIST_SELECT = {
  id: true,
  taskNo: true,
  opNo: true,
  title: true,
  revisionCode: true,
  designType: true,
  signType: true,
  signFamily: true,
  disciplineType: true,
  phase: true,
  description: true,
  status: true,
  priority: true,
  dueDate: true,
  startedAt: true,
  completedAt: true,
  holdPreviousStatus: true,
  reworkNote: true,
  reworkAttachmentUrl: true,
  reworkAttachmentName: true,
  reworkLinkUrl: true,
  reworkLinkName: true,
  previousRevisionTaskId: true,
  projectId: true,
  project: {
    select: {
      id: true,
      name: true,
      projectNo: true,
      category: true,
      salesPerson: true,
      technicalHead: true,
      teamLead: true,
      subTeamLead: true,
      designers: true,
    },
  },
  assigneeId: true,
  assignee: { select: { id: true, fullName: true, email: true } },
  taskDesigners: { select: { designer: { select: { id: true, fullName: true, email: true } } } },
  retailDetails: { select: { hoursRequired: true, designTypes: true } },
  projectDetails: { select: { artworkHours: true, technicalHours: true, locationHours: true, asBuiltHours: true } },
  createdAt: true,
  updatedAt: true,
};



export type TaskFilters = {
  projectId?: string;
  status?: string;
  /** Comma-separated statuses to exclude, e.g. callers that only need outstanding work. */
  excludeStatuses?: string;
  priority?: string;
  assigneeId?: string;
  search?: string;
  /** Project category filter (Retail / Project) — matches design-list type filter. */
  type?: string;
  salesPerson?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  /** When true, SALESPERSON list is limited to SALES_REVIEW (sales review queue). */
  salesQueue?: boolean;
  /** When true, SALESPERSON list shows tasks they already reviewed (left the queue). */
  salesHistory?: boolean;
};

export type NextRevisionQuery = {
  projectId?: string;
  projectNo?: string;
  opNo?: string;
  designType?: string;
};

export type NextPhaseQuery = {
  projectId?: string;
  projectNo?: string;
  opNo?: string;
  designType?: string;
};

type PhaseContext = { maxPhase: number; bySignType: Map<string, number> };

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskFilesService: TaskFilesService,
    private readonly activityLogger: ActivityLoggerService,
    private readonly notificationsService: NotificationsService,
    @Optional() private readonly dashboardRealtime?: DashboardRealtimeService,
  ) {}

  /**
   * HOD + Admin (org-wide) plus sales users matched to the project — never every salesperson.
   */
  private async resolveHodAdminAndSalesNotifyIds(
    project: { salesPerson?: string | null; createdById?: string | null } | null | undefined,
    options?: { taskId?: string },
  ): Promise<string[]> {
    const [managers, salesUsers] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
        select: { id: true },
      }),
      this.prisma.user.findMany({
        where: { role: { name: 'SALESPERSON' } },
        select: { id: true, fullName: true },
      }),
    ]);

    let matched = matchSalesUsersToProject(project, salesUsers);
    if (matched.length === 0 && options?.taskId) {
      const created = await this.prisma.activityLog.findFirst({
        where: { taskId: options.taskId, action: ActivityAction.TASK_CREATED },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      });
      if (created?.userId) {
        matched = matchSalesUsersToProject(project, salesUsers, {
          extraUserIds: [created.userId],
        });
      }
    }

    return [...new Set([...managers.map((m) => m.id), ...matched.map((s) => s.id)])];
  }

  /** Admin + project-matched sales only (SALES_REVIEW queue). */
  private async resolveSalesReviewNotifyIds(
    project: { salesPerson?: string | null; createdById?: string | null } | null | undefined,
    options?: { taskId?: string },
  ): Promise<string[]> {
    const [admins, salesUsers] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: { name: 'ADMIN' } },
        select: { id: true },
      }),
      this.prisma.user.findMany({
        where: { role: { name: 'SALESPERSON' } },
        select: { id: true, fullName: true },
      }),
    ]);

    let matched = matchSalesUsersToProject(project, salesUsers);
    if (matched.length === 0 && options?.taskId) {
      const created = await this.prisma.activityLog.findFirst({
        where: { taskId: options.taskId, action: ActivityAction.TASK_CREATED },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      });
      if (created?.userId) {
        matched = matchSalesUsersToProject(project, salesUsers, {
          extraUserIds: [created.userId],
        });
      }
    }

    return [...new Set([...admins.map((a) => a.id), ...matched.map((s) => s.id)])];
  }

  private normalizeTaskForApi<T extends { status?: string | null; holdPreviousStatus?: string | null }>(
    task: T,
  ): T {
    return {
      ...task,
      status: toApiTaskStatus(task.status),
      ...(task.holdPreviousStatus != null
        ? { holdPreviousStatus: toApiTaskStatus(task.holdPreviousStatus) }
        : {}),
    };
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value ?? '').trim(),
    );
  }

  private isAbsoluteHttpUrl(value: string) {
    return /^https?:\/\//i.test(String(value ?? '').trim());
  }

  /** Prefer S3 object key for storage; unwrap unsigned bucket URLs back to keys. */
  private toStoredS3ObjectKey(value?: string | null): string | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    if (!this.isAbsoluteHttpUrl(raw)) return raw;
    try {
      const parsed = new URL(raw);
      // Already a usable signed URL — leave as-is for legacy rows.
      if (parsed.searchParams.has('X-Amz-Algorithm') || parsed.searchParams.has('X-Amz-Signature')) {
        return raw;
      }
      if (parsed.hostname.includes('.s3.') || parsed.hostname.startsWith('s3.')) {
        const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
        return key || raw;
      }
    } catch {
      return raw;
    }
    return raw;
  }

  private async resolveReadableFileUrl(stored?: string | null): Promise<string | null> {
    const raw = String(stored ?? '').trim();
    if (!raw) return null;
    if (this.isAbsoluteHttpUrl(raw)) {
      try {
        const parsed = new URL(raw);
        if (parsed.searchParams.has('X-Amz-Algorithm') || parsed.searchParams.has('X-Amz-Signature')) {
          return raw;
        }
        if (parsed.hostname.includes('.s3.') || parsed.hostname.startsWith('s3.')) {
          const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
          if (key) return this.taskFilesService.createSignedReadUrl(key);
        }
      } catch {
        return raw;
      }
      return raw;
    }
    return this.taskFilesService.createSignedReadUrl(raw);
  }

  private async withSignedAttachmentUrls<T extends {
    retailDetails?: any[];
    projectDetails?: any[];
    reworkAttachmentUrl?: string | null;
  }>(task: T): Promise<T & { reworkAttachmentUrl?: string | null }> {
    const allKeys = [
      ...(task.retailDetails ?? []).flatMap((line) => (line.attachments ?? []).map((a: any) => a.fileKey)),
      ...(task.projectDetails ?? []).flatMap((line) => (line.attachments ?? []).map((a: any) => a.fileKey)),
    ].filter(Boolean);
    const uniqueKeys = Array.from(new Set(allKeys));
    const signedMap = new Map<string, string>();
    await Promise.all(
      uniqueKeys.map(async (key) => {
        const signedUrl = this.isAbsoluteHttpUrl(key)
          ? key
          : await this.taskFilesService.createSignedReadUrl(key);
        signedMap.set(key, signedUrl);
      }),
    );

    const reworkAttachmentUrl = await this.resolveReadableFileUrl(task.reworkAttachmentUrl);

    return {
      ...task,
      reworkAttachmentUrl,
      retailDetails: (task.retailDetails ?? []).map((line: any) => ({
        ...line,
        attachments: (line.attachments ?? []).map((a: any) => ({
          ...a,
          sizeBytes: typeof a.sizeBytes === 'bigint' ? Number(a.sizeBytes) : a.sizeBytes,
          signedUrl: signedMap.get(a.fileKey) ?? null,
        })),
      })),
      projectDetails: (task.projectDetails ?? []).map((line: any) => ({
        ...line,
        attachments: (line.attachments ?? []).map((a: any) => ({
          ...a,
          sizeBytes: typeof a.sizeBytes === 'bigint' ? Number(a.sizeBytes) : a.sizeBytes,
          signedUrl: signedMap.get(a.fileKey) ?? null,
        })),
      })),
    };
  }

  private buildTaskNo(opNo?: string) {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const rand = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, '0');
    const cleanedOp = (opNo ?? '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(-8);
    return cleanedOp ? `TSK-${cleanedOp}-${stamp}-${rand}` : `TSK-${stamp}-${rand}`;
  }

  private normalizeDesignType(value?: string | null): string {
    const raw = String(value ?? '').trim().toUpperCase();
    if (raw === 'ESTIMATION PURPOSE' || raw === 'ESTIMATION_PURPOSE') return 'ESTIMATION_PURPOSE';
    if (raw === 'PRESENTATION') return 'PRESENTATION';
    if (raw === 'CLIENT SUBMISSION' || raw === 'CLIENT_SUBMISSION') return 'CLIENT_SUBMISSION';
    if (raw === 'TECHNICAL DRAWING' || raw === 'TECHNICAL_DRAWING') return 'TECHNICAL_DRAWING';
    if (raw === 'PROJECT') return 'PROJECT';
    if (!raw) return 'PROJECT';
    return raw.replace(/\s+/g, '_');
  }

  private static readonly REVISION_BUMP_BLOCKED_MESSAGE =
    'New revision cannot be created when the current revision is still open';

  private normalizeRevisionCode(value?: string | null): string | null {
    const raw = String(value ?? '').trim().toUpperCase();
    if (!raw) return null;
    if (!/^R\d+$/.test(raw)) {
      throw new BadRequestException('revisionCode must match R<number> (R0, R1, R2...).');
    }
    return raw;
  }

  private getRevisionNumber(revisionCode: string): number {
    const m = /^R(\d+)$/.exec(revisionCode);
    return m ? Number.parseInt(m[1], 10) : -1;
  }

  /** True while the revision line is still active (work, review, rework, hold). */
  private isRevisionOpenStatus(status?: string | null): boolean {
    const api = toApiTaskStatus(status);
    return api !== 'CLIENT_ACCEPTED' && api !== 'CLIENT_REJECTED';
  }

  private async findOpenRevisionState(
    tx: Prisma.TransactionClient | PrismaService,
    params: { projectId: string; opNo: string; designType: string },
  ): Promise<{
    hasTasks: boolean;
    openMaxRevision: string | null;
    overallMaxRevision: string | null;
    /** True when the highest revision in scope was client-rejected (next Rn is allowed). */
    canBumpAfterReject: boolean;
    blocker: { taskNo: string | null; revisionCode: string | null; status: string } | null;
  }> {
    const rows = await tx.task.findMany({
      where: {
        projectId: params.projectId,
        opNo: params.opNo,
        designType: params.designType,
        revisionCode: { not: null },
      },
      select: { taskNo: true, revisionCode: true, status: true },
    });

    let openMax = -1;
    let overallMax = -1;
    let rejectedAtOverallMax = false;
    let blocker: { taskNo: string | null; revisionCode: string | null; status: string } | null = null;

    for (const row of rows) {
      if (!row.revisionCode) continue;
      const n = this.getRevisionNumber(row.revisionCode);
      const api = toApiTaskStatus(row.status);
      if (n > overallMax) {
        overallMax = n;
        rejectedAtOverallMax = api === 'CLIENT_REJECTED';
      } else if (n === overallMax && api === 'CLIENT_REJECTED') {
        rejectedAtOverallMax = true;
      }
      if (this.isRevisionOpenStatus(row.status) && n >= openMax) {
        openMax = n;
        blocker = {
          taskNo: row.taskNo ?? null,
          revisionCode: row.revisionCode,
          status: api,
        };
      }
    }

    // If any open task sits on overall max, that line is not "rejected-only".
    if (openMax >= 0 && openMax === overallMax) {
      rejectedAtOverallMax = false;
    }

    return {
      hasTasks: rows.length > 0,
      openMaxRevision: openMax >= 0 ? `R${openMax}` : null,
      overallMaxRevision: overallMax >= 0 ? `R${overallMax}` : null,
      canBumpAfterReject: overallMax >= 0 && rejectedAtOverallMax,
      blocker,
    };
  }

  /**
   * Revision for Create Task / next-revision: stay on the open line.
   * After Client Rejected (no open successor yet), allow R{max+1}.
   * Pure Client Accepted lines stay blocked.
   */
  private async resolveRevisionCodeForCreate(
    tx: Prisma.TransactionClient | PrismaService,
    params: { projectId: string; opNo: string; designType: string },
  ): Promise<string> {
    const state = await this.findOpenRevisionState(tx, params);
    if (state.openMaxRevision) return state.openMaxRevision;
    if (!state.hasTasks) return 'R0';
    if (state.canBumpAfterReject && state.overallMaxRevision) {
      return `R${this.getRevisionNumber(state.overallMaxRevision) + 1}`;
    }
    throw new BadRequestException(TasksService.REVISION_BUMP_BLOCKED_MESSAGE);
  }

  /** Enforce stay-on-open / reject-only bump when the client sends or omits revisionCode. */
  private async assertRevisionAllowedForCreate(
    tx: Prisma.TransactionClient | PrismaService,
    params: {
      projectId: string;
      opNo: string;
      designType: string;
      requestedRevision: string | null;
    },
  ): Promise<string> {
    const state = await this.findOpenRevisionState(tx, {
      projectId: params.projectId,
      opNo: params.opNo,
      designType: params.designType,
    });

    if (state.openMaxRevision) {
      if (!params.requestedRevision) return state.openMaxRevision;
      if (this.getRevisionNumber(params.requestedRevision) > this.getRevisionNumber(state.openMaxRevision)) {
        const detail = state.blocker
          ? ` (${state.blocker.taskNo ?? 'task'}, ${state.blocker.revisionCode ?? state.openMaxRevision}, ${state.blocker.status})`
          : ` (${state.openMaxRevision})`;
        throw new BadRequestException(`${TasksService.REVISION_BUMP_BLOCKED_MESSAGE}${detail}`);
      }
      return params.requestedRevision;
    }

    if (!state.hasTasks) {
      return params.requestedRevision ?? 'R0';
    }

    if (state.canBumpAfterReject && state.overallMaxRevision) {
      const next = `R${this.getRevisionNumber(state.overallMaxRevision) + 1}`;
      if (!params.requestedRevision) return next;
      // Stale form still sending closed Rn → promote to the post-reject revision.
      if (this.getRevisionNumber(params.requestedRevision) <= this.getRevisionNumber(state.overallMaxRevision)) {
        return next;
      }
      if (this.getRevisionNumber(params.requestedRevision) > this.getRevisionNumber(next)) {
        throw new BadRequestException(TasksService.REVISION_BUMP_BLOCKED_MESSAGE);
      }
      return params.requestedRevision;
    }

    throw new BadRequestException(TasksService.REVISION_BUMP_BLOCKED_MESSAGE);
  }

  /** When this revision slot is already taken by an open task. */
  private throwRevisionSlotTaken(existing: {
    taskNo?: string | null;
    revisionCode?: string | null;
    status?: string | null;
  }, fallbackRevision: string): never {
    const taskNo = existing.taskNo?.trim() || 'task';
    const revision = existing.revisionCode?.trim() || fallbackRevision;
    const status = toApiTaskStatus(existing.status);
    if (status === 'CLIENT_REJECTED' || status === 'CLIENT_ACCEPTED') {
      throw new BadRequestException(
        `Revision ${revision} is closed (${taskNo}, ${status}). A new revision is created only after Client Rejected.`,
      );
    }
    throw new BadRequestException(
      `${TasksService.REVISION_BUMP_BLOCKED_MESSAGE} (${taskNo}, ${revision}, ${status})`,
    );
  }

  /** True max+1 — used only by createRevisionFromClientReject. */
  private async resolveNextRevisionCode(
    tx: Prisma.TransactionClient | PrismaService,
    params: { projectId: string; opNo: string; designType: string; signType?: string | null },
  ): Promise<string> {
    const rows = await tx.task.findMany({
      where: {
        projectId: params.projectId,
        opNo: params.opNo,
        designType: params.designType,
        ...(params.signType ? { signType: params.signType } : {}),
        revisionCode: { not: null },
      },
      select: { revisionCode: true },
    });
    let max = -1;
    for (const row of rows) {
      if (!row.revisionCode) continue;
      const n = this.getRevisionNumber(row.revisionCode);
      if (n > max) max = n;
    }
    return `R${max + 1}`;
  }

  async getNextRevision(query: NextRevisionQuery) {
    const opNo = String(query.opNo ?? '').trim();
    if (!opNo) throw new BadRequestException('opNo is required');

    let projectId = String(query.projectId ?? '').trim();
    if (!projectId) {
      const project = await this.resolveProjectForCreate({ projectNo: query.projectNo, opNo });
      projectId = project.id;
    }
    const designType = this.normalizeDesignType(query.designType);
    const revisionCode = await this.resolveRevisionCodeForCreate(this.prisma, { projectId, opNo, designType });
    return { projectId, opNo, designType, revisionCode };
  }

  /** Project-wide phase history: overall max phase plus each sign type's own last-used phase. */
  private async getPhaseContext(
    tx: Prisma.TransactionClient | PrismaService,
    projectId: string,
  ): Promise<PhaseContext> {
    const rows = await tx.task.findMany({
      where: { projectId, designType: 'PROJECT', phase: { not: null } },
      select: { phase: true, signType: true },
    });
    let maxPhase = 0;
    const bySignType = new Map<string, number>();
    for (const row of rows) {
      const phase = row.phase ?? 0;
      if (phase > maxPhase) maxPhase = phase;
      if (row.signType) {
        const current = bySignType.get(row.signType) ?? 0;
        if (phase > current) bySignType.set(row.signType, phase);
      }
    }
    return { maxPhase, bySignType };
  }

  /**
   * Smart phase suggestion: if any sign type in this submission already has phase
   * history in the project, continue that lineage (its last phase + 1); otherwise
   * start a new project-wide phase (maxPhase + 1).
   */
  private resolveNextPhase(context: PhaseContext, signTypes: Array<string | null | undefined>): number {
    const lineages = Array.from(new Set(signTypes.filter((s): s is string => !!s)))
      .map((signType) => context.bySignType.get(signType))
      .filter((value): value is number => typeof value === 'number');
    if (lineages.length > 0) return Math.max(...lineages) + 1;
    return context.maxPhase + 1;
  }

  async getNextPhase(query: NextPhaseQuery) {
    let projectId = String(query.projectId ?? '').trim();
    if (!projectId) {
      const project = await this.resolveProjectForCreate({ projectNo: query.projectNo, opNo: query.opNo });
      projectId = project.id;
    }
    const context = await this.getPhaseContext(this.prisma, projectId);
    return {
      projectId,
      maxPhase: context.maxPhase,
      bySignType: Object.fromEntries(
        Array.from(context.bySignType.entries()).map(([signType, phase]) => [signType, { maxPhase: phase }]),
      ),
    };
  }

  private async resolveProjectForCreate(task: { projectId?: string; projectNo?: string; opNo?: string }): Promise<ProjectLookup> {
    const tryFindByProjectNo = async (raw: string | undefined): Promise<ProjectLookup | null> => {
      const value = (raw ?? '').trim();
      if (!value) return null;

      const exact = await this.prisma.project.findFirst({
        where: { projectNo: value },
        select: PROJECT_LOOKUP_SELECT,
      });
      if (exact) return exact;

      const normalized = value.toLowerCase().replace(/[\s-]/g, '');
      const candidates = await this.prisma.project.findMany({
        where: { projectNo: { not: null } },
        select: PROJECT_LOOKUP_SELECT,
        take: 5000,
      });
      return (
        candidates.find(
          (p) =>
            (p.projectNo ?? '')
              .toLowerCase()
              .replace(/[\s-]/g, '') === normalized,
        ) ?? null
      );
    };

    const byProjectNo = await tryFindByProjectNo(task.projectNo);
    if (byProjectNo) return byProjectNo;

    const byOpNoAsProjectNo = await tryFindByProjectNo(task.opNo);
    if (byOpNoAsProjectNo) return byOpNoAsProjectNo;

    throw new NotFoundException('Project not found (reuse existing projectNo or OP no)');
  }

  /** Live ERP sales person for a project code / Salesforce OP (best-effort). */
  private async lookupErpSalesPerson(params: {
    projectCode?: string | null;
    salesForceCode?: string | null;
  }): Promise<string | null> {
    const projectCode = String(params.projectCode ?? '').trim();
    const salesForceCode = String(params.salesForceCode ?? '').trim();
    if (!projectCode && !salesForceCode) return null;

    try {
      const rows = await this.prisma.live.$queryRaw<Array<{ salesPerson: string | null }>>(Prisma.sql`
        SELECT TOP 1
          me.firstName + '' + me.lastName AS salesPerson
        FROM ErpMasterProject mp
        LEFT JOIN ErpMasterOpportunity mo ON mo.projectid = mp.projectid
        LEFT JOIN ErpMasterEmployee me ON me.employeeId = mo.salesRepId
        WHERE mp.isActive = 1
          AND (
            (${projectCode} <> '' AND (
              mp.projectCode = ${projectCode}
              OR REPLACE(REPLACE(LOWER(mp.projectCode), ' ', ''), '-', '') =
                 REPLACE(REPLACE(LOWER(${projectCode}), ' ', ''), '-', '')
            ))
            OR (${salesForceCode} <> '' AND LTRIM(RTRIM(mo.salesForceCode)) = ${salesForceCode})
          )
        ORDER BY mp.createdOn DESC
      `);
      const name = String(rows[0]?.salesPerson ?? '').trim();
      return name || null;
    } catch (err) {
      this.logger.warn(
        `lookupErpSalesPerson failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async resolveOrCreateProjectForExtended(
    task: {
      projectNo?: string;
      opNo?: string;
      title?: string;
      description?: string;
      projectName?: string;
      businessUnit?: string;
    },
    designType: 'Retail' | 'Project',
  ): Promise<ProjectLookup> {
    const requestedName = (task.projectName ?? '').trim();
    if (!requestedName) {
      throw new BadRequestException('projectName is required when creating task from project context');
    }

    const existing = await this.resolveProjectForCreate(task).catch(() => null);
    if (existing) {
      const patch: { name?: string; salesPerson?: string | null } = {};
      if (requestedName && requestedName !== (existing.name ?? '').trim()) {
        patch.name = requestedName;
      }
      // Backfill ERP sales person when the app project was created without it.
      if (!String(existing.salesPerson ?? '').trim()) {
        const erpSalesPerson = await this.lookupErpSalesPerson({
          projectCode: existing.projectNo ?? task.projectNo,
          salesForceCode: task.opNo,
        });
        if (erpSalesPerson) patch.salesPerson = erpSalesPerson;
      }
      if (Object.keys(patch).length > 0) {
        return this.prisma.project.update({
          where: { id: existing.id },
          data: patch,
          select: PROJECT_LOOKUP_SELECT,
        });
      }
      return existing;
    }

    const projectNo = (task.projectNo ?? task.opNo ?? '').trim();
    if (!projectNo) {
      throw new BadRequestException('projectNo or opNo is required to create project in ERP-Dev');
    }

    const name = requestedName;
    const businessUnit = (task.businessUnit ?? designType).trim();
    const category = designType;
    const salesPerson = await this.lookupErpSalesPerson({
      projectCode: task.projectNo,
      salesForceCode: task.opNo,
    });

    return this.prisma.project.create({
      data: {
        projectNo,
        name,
        category,
        businessUnit,
        description: task.description?.trim() || null,
        status: 'ACTIVE',
        salesPerson,
      },
      select: PROJECT_LOOKUP_SELECT,
    });
  }

  async create(userId: string, dto: CreateTaskDto) {
    const project = await this.resolveProjectForCreate({
      projectNo: dto.projectNo,
      opNo: dto.opNo,
    });
    const normalizedOpNo = String(dto.opNo ?? '').trim();
    if (!normalizedOpNo) {
      throw new BadRequestException('opNo is required for revision-based task creation.');
    }
    const normalizedDesignType = this.normalizeDesignType(dto.designType);

    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const requestedRevision = this.normalizeRevisionCode(dto.revisionCode);
        const revisionCode = await this.assertRevisionAllowedForCreate(this.prisma, {
          projectId: project.id,
          opNo: normalizedOpNo,
          designType: normalizedDesignType,
          requestedRevision,
        });

        const duplicate = await this.prisma.task.findFirst({
          where: {
            projectId: project.id,
            opNo: normalizedOpNo,
            designType: normalizedDesignType,
            revisionCode,
          },
          select: { taskNo: true, revisionCode: true, status: true },
        });
        if (duplicate) {
          this.throwRevisionSlotTaken(duplicate, revisionCode);
        }

        const createdId = await this.prisma.$transaction(
          async (tx) => {
            const created = await tx.task.create({
              data: {
                taskNo: this.buildTaskNo(dto.opNo),
                title: dto.title?.trim() || null,
                revisionCode,
                designType: normalizedDesignType,
                opNo: normalizedOpNo,
                description: dto.description,
                priority: dto.priority ?? 'Medium',
                dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
                projectId: project.id,
                assigneeId: dto.assigneeId ?? null,
              },
              select: { id: true },
            });
            return created.id;
          },
          { timeout: 15_000 },
        );

        const created = await this.prisma.task.findUnique({
          where: { id: createdId },
          select: TASK_SELECT,
        });
        if (!created) throw new NotFoundException('Task not found after create');

        await this.activityLogger.log({
          action: ActivityAction.TASK_CREATED,
          userId,
          taskId: created.id,
          details: {
            event: ActivityAction.TASK_CREATED,
            messageKey: 'task_created',
            taskSnapshot: {
              id: created.id,
              taskNo: created.taskNo,
              opNo: created.opNo,
              title: created.title ?? undefined,
              status: created.status,
            },
            projectSnapshot: {
              id: created.project?.id,
              projectNo: created.project?.projectNo,
              name: created.project?.name,
            },
            context: { source: 'tasks.create' },
          },
        });
        return created;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < 4
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new BadRequestException('Failed to generate unique task number');
  }

  async createExtended(userId: string, dto: CreateExtendedTaskDto) {
    const hasRetail = (dto.retailDetails?.length ?? 0) > 0;
    const hasProject = (dto.projectDetails?.length ?? 0) > 0;
    const normalizedOpNo = String(dto.task.opNo ?? '').trim();
    if (!normalizedOpNo) {
      throw new BadRequestException('task.opNo is required for revision-based task creation.');
    }
    const normalizedDesignType = this.normalizeDesignType(dto.task.designType ?? dto.designType);

    if (hasRetail && hasProject) {
      throw new BadRequestException('Send either retailDetails or projectDetails, not both');
    }
    if (dto.designType === 'Retail' && hasProject) {
      throw new BadRequestException('designType Retail cannot include projectDetails');
    }
    if (dto.designType === 'Project' && hasRetail) {
      throw new BadRequestException('designType Project cannot include retailDetails');
    }

    const project = await this.resolveOrCreateProjectForExtended(dto.task, dto.designType);

    if (dto.designType === 'Project') {
      const teamIncomplete =
        !project.technicalHead?.trim() ||
        !project.teamLead?.trim() ||
        !project.subTeamLead?.trim() ||
        !project.designers?.trim();
      if (teamIncomplete) {
        throw new BadRequestException(
          'Project team must be assigned before creating tasks. Set Technical Head, Team Lead, Sub Team Lead and at least one Designer first.',
        );
      }

      const qsStatusRows = await this.prisma.$queryRaw<Array<{ status: string }>>(Prisma.sql`
        SELECT TOP 1 [status] FROM [dbo].[ErpTSProjectQsStatus] WHERE [projectId] = ${project.id}
      `);
      const qsStatus = (qsStatusRows[0]?.status ?? '').trim().toLowerCase();
      if (qsStatus !== 'completed') {
        throw new BadRequestException('QS must submit the sign register first.');
      }
    }

    await this.assignProjectToQsTeam(project.id, userId, {
      name: project.name,
      projectNo: project.projectNo,
    });

    if (dto.task.assigneeId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.task.assigneeId } });
      if (!assignee) throw new NotFoundException('Assignee not found');
    }

    const fileKeysToCheck = [
      ...(dto.retailDetails ?? []).flatMap((line) => [
        ...(line.attachments ?? []).map((attachment) => attachment.fileKey),
        ...(line.fileKey ? [line.fileKey] : []),
      ]),
      ...(dto.projectDetails ?? []).flatMap((line) =>
        (line.attachments ?? []).map((attachment) => attachment.fileKey),
      ),
    ].filter((key) => key && !this.isAbsoluteHttpUrl(key));
    if (fileKeysToCheck.length > 0) {
      await this.taskFilesService.assertKeysExist(fileKeysToCheck);
    }

    // ── RETAIL PATH: 1 task + N retail detail rows ─────────────────────────
    // Reads (revision/duplicate + TASK_SELECT) stay outside the interactive tx —
    // remote SQL Server + heavy joins blow Prisma's default 5s timeout (P2028).
    if (dto.designType === 'Retail') {
      const requestedRevision = this.normalizeRevisionCode(dto.task.revisionCode);
      const revisionCode = await this.assertRevisionAllowedForCreate(this.prisma, {
        projectId: project.id,
        opNo: normalizedOpNo,
        designType: normalizedDesignType,
        requestedRevision,
      });

      const duplicate = await this.prisma.task.findFirst({
        where: {
          projectId: project.id,
          opNo: normalizedOpNo,
          designType: normalizedDesignType,
          revisionCode,
        },
        select: { taskNo: true, revisionCode: true, status: true },
      });
      if (duplicate) {
        this.throwRevisionSlotTaken(duplicate, revisionCode);
      }

      const taskId = await this.prisma.$transaction(
        async (tx) => {
          let createdTaskId: string | null = null;
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              const createdTask = await tx.task.create({
                data: {
                  taskNo: this.buildTaskNo(dto.task.opNo),
                  title: dto.task.title?.trim() || null,
                  revisionCode,
                  designType: normalizedDesignType,
                  opNo: normalizedOpNo,
                  description: dto.task.description,
                  priority: dto.task.priority ?? 'Medium',
                  dueDate: dto.task.dueDate ? new Date(dto.task.dueDate) : undefined,
                  projectId: project.id,
                  assigneeId: dto.task.assigneeId ?? null,
                },
                select: { id: true },
              });
              createdTaskId = createdTask.id;
              break;
            } catch (error) {
              if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002' &&
                attempt < 4
              ) {
                continue;
              }
              throw error;
            }
          }
          if (!createdTaskId) throw new BadRequestException('Failed to generate unique task number');

          for (const line of dto.retailDetails ?? []) {
            const createdLine = await tx.retailTaskDetail.create({
              data: {
                taskId: createdTaskId,
                providedFile: line.providedFile,
                fileUrl: line.fileUrl,
                hodName: line.hodName,
                designTypes: line.designTypes?.length ? line.designTypes[0] : null,
                hoursRequired: line.hoursRequired ?? null,
                comment: line.comment,
                signFamily: line.signFamily,
                signType: line.signType,
                planCode: line.planCode,
                contractRef: line.contractRef,
                quantity: line.quantity ?? null,
                deadline: line.deadline ? new Date(line.deadline) : null,
              },
              select: { id: true },
            });

            const attachments = [
              ...(line.attachments ?? []),
              ...(line.fileKey
                ? [
                    {
                      fileKey: line.fileKey,
                      fileName: line.providedFile ?? 'attachment',
                      mimeType: null,
                      size: undefined,
                    },
                  ]
                : []),
            ];

            if (attachments.length > 0) {
              await tx.retailTaskDetailAttachment.createMany({
                data: attachments.map((attachment) => ({
                  retailTaskDetailId: createdLine.id,
                  fileKey: attachment.fileKey,
                  fileName: attachment.fileName,
                  mimeType: attachment.mimeType ?? null,
                  sizeBytes:
                    typeof attachment.size === 'number' ? Math.round(attachment.size) : null,
                })),
              });
            }
          }

          return createdTaskId;
        },
        { timeout: 15_000 },
      );

      const created = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: TASK_SELECT,
      });
      if (!created) throw new NotFoundException('Task not found after create');
      await this.activityLogger.log({
        action: ActivityAction.TASK_CREATED,
        userId,
        taskId: created.id,
        details: {
          event: ActivityAction.TASK_CREATED,
          messageKey: 'task_created',
          taskSnapshot: { id: created.id, taskNo: created.taskNo, opNo: created.opNo, title: created.title ?? undefined, status: created.status },
          projectSnapshot: { id: created.project?.id, projectNo: created.project?.projectNo, name: created.project?.name },
          context: { source: 'tasks.createExtended', designType: dto.designType },
        },
      });

      if (created.assigneeId) {
        const taskLink = `/retail-task-view/${created.id}`;
        const createMsg = `${created.taskNo} — ${created.project?.name ?? 'Unknown Project'} has been assigned to you.`;
        this.notificationsService
          .create({ userId: created.assigneeId, title: 'Task Assigned to You', message: createMsg, linkUrl: taskLink })
          .then(() => this.logger.debug(`[NOTIFY] task created — designer notified`))
          .catch((err) => this.logger.error('Failed to notify designer on task create', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(created.assigneeId);

        const stakeholderIds = await this.resolveHodAdminAndSalesNotifyIds(created.project, {
          taskId: created.id,
        });
        const hodMsg = `${created.taskNo} — ${created.project?.name ?? 'Unknown Project'} created and assigned to ${created.assignee?.fullName ?? 'a designer'}.`;
        for (const stakeholderId of stakeholderIds) {
          if (stakeholderId !== created.assigneeId) {
            this.notificationsService
              .create({ userId: stakeholderId, title: 'New Task Assigned', message: hodMsg, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify HOD on task create', err));
            this.dashboardRealtime?.notifyUserNotificationRefresh(stakeholderId);
          }
        }
      }

      const withUrls = await this.withSignedAttachmentUrls(created);
      return { tasks: [this.normalizeTaskForApi(withUrls)], count: 1 };
    }

    // ── PROJECT PATH: one ErpTSTask per sign-type detail line ───────────────
    const requestedRevision = this.normalizeRevisionCode(dto.task.revisionCode);
    const revisionCode = await this.assertRevisionAllowedForCreate(this.prisma, {
      projectId: project.id,
      opNo: normalizedOpNo,
      designType: normalizedDesignType,
      requestedRevision,
    });
    const requestedPhase = dto.task.phase != null ? Math.trunc(dto.task.phase) : null;
    if (requestedPhase != null && requestedPhase < 1) {
      throw new BadRequestException('phase must be a positive integer (1, 2, 3, ...).');
    }

    // Pre-flight: batch duplicate check outside the transaction (one query instead of N)
    {
      const lines = dto.projectDetails ?? [];
      if (lines.length > 0) {
        const existing = await this.prisma.task.findMany({
          where: {
            projectId: project.id,
            opNo: normalizedOpNo,
            designType: normalizedDesignType,
            revisionCode,
            OR: lines.map((line) => ({
              signType: line.signType ?? null,
              disciplineType: line.disciplineType?.trim() ?? null,
            })),
          },
          select: { taskNo: true, revisionCode: true, status: true },
        });
        if (existing.length > 0) {
          this.throwRevisionSlotTaken(existing[0], revisionCode);
        }
      }
    }

    // Only writes inside the transaction; reads moved out where possible to avoid P2028 timeout.
    // Revision is resolved once for the whole submission (reject-only bump policy).
    // Returns task IDs and detail IDs; attachments are batched outside in one createMany.
    const created = await this.prisma.$transaction(async (tx) => {
      const results: { taskId: string; detailId: string }[] = [];

      // Phase is project-scoped (not per-opNo/signType like revision), so it's
      // resolved once for the whole submission — every task created here shares it.
      const phase =
        requestedPhase ??
        this.resolveNextPhase(
          await this.getPhaseContext(tx, project.id),
          (dto.projectDetails ?? []).map((line) => line.signType ?? null),
        );

      for (const line of dto.projectDetails ?? []) {
        const lineSignType = line.signType ?? null;
        const lineSignFamily = line.signFamily?.trim() ?? null;
        const lineDiscipline = line.disciplineType?.trim() ?? null;
        let taskId: string | null = null;

        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const taskTitle = [normalizedOpNo, lineSignType, lineDiscipline, revisionCode].filter(Boolean).join(' - ') || dto.task.title?.trim() || null;
            const createdTask = await tx.task.create({
              data: {
                taskNo: this.buildTaskNo(dto.task.opNo),
                title: taskTitle,
                revisionCode,
                designType: normalizedDesignType,
                signType: lineSignType,
                signFamily: lineSignFamily,
                disciplineType: lineDiscipline,
                phase,
                opNo: normalizedOpNo,
                description: dto.task.description,
                priority: dto.task.priority ?? 'Medium',
                dueDate: line.deadline ? new Date(line.deadline) : (dto.task.dueDate ? new Date(dto.task.dueDate) : undefined),
                projectId: project.id,
                assigneeId: dto.task.assigneeId ?? null,
              },
              select: { id: true },
            });
            taskId = createdTask.id;
            break;
          } catch (error) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002' &&
              attempt < 4
            ) {
              continue;
            }
            throw error;
          }
        }
        if (!taskId) throw new BadRequestException('Failed to generate unique task number');

        const createdLine = await tx.projectTaskDetail.create({
          data: {
            taskId,
            signType: line.signType,
            planCode: line.planCode,
            area: line.area,
            level: line.level,
            artwork: line.artwork ?? false,
            artworkHours: line.artworkHours ?? null,
            technical: line.technical ?? false,
            technicalHours: line.technicalHours ?? null,
            location: line.location ?? false,
            locationHours: line.locationHours ?? null,
            asBuilt: line.asBuilt ?? false,
            asBuiltHours: line.asBuiltHours ?? null,
            bim: line.bim ?? false,
            deadline: line.deadline ? new Date(line.deadline) : null,
            comment: line.comment,
          },
          select: { id: true },
        });

        results.push({ taskId, detailId: createdLine.id });
      }

      return results;
    }, { timeout: 30000 });

    // One createMany for all attachments across all tasks (same files on every task).
    const sharedAttachments = (dto.projectDetails?.[0]?.attachments ?? []);
    if (sharedAttachments.length > 0) {
      await this.prisma.projectTaskDetailAttachment.createMany({
        data: created.flatMap(({ detailId }) =>
          sharedAttachments.map((attachment) => ({
            projectTaskDetailId: detailId,
            fileKey: attachment.fileKey,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType ?? null,
            sizeBytes: typeof attachment.size === 'number' ? Math.round(attachment.size) : null,
          })),
        ),
      });
    }

    // Fetch full task details outside the transaction (heavy joins would cause P2028 inside).
    const createdTasks = await Promise.all(
      created.map(({ taskId }) => this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT })),
    );

    // Log activity + notify for each created task
    await Promise.all(createdTasks.filter((t): t is NonNullable<typeof t> => t !== null).map((task) =>
      this.activityLogger.log({
        action: ActivityAction.TASK_CREATED,
        userId,
        taskId: task.id,
        details: {
          event: ActivityAction.TASK_CREATED,
          messageKey: 'task_created',
          taskSnapshot: { id: task.id, taskNo: task.taskNo, opNo: task.opNo, title: task.title ?? undefined, status: task.status },
          projectSnapshot: { id: task.project?.id, projectNo: task.project?.projectNo, name: task.project?.name },
          context: { source: 'tasks.createExtended', designType: dto.designType },
        },
      }),
    ));

    for (const task of createdTasks) {
      if (!task) continue;

      if (task.assigneeId) {
        const taskLink = `/project-task-view/${task.id}`;
        const createMsg = `${task.taskNo} — ${task.project?.name ?? 'Unknown Project'} has been assigned to you.`;
        this.notificationsService
          .create({ userId: task.assigneeId, title: 'Task Assigned to You', message: createMsg, linkUrl: taskLink })
          .catch((err) => this.logger.error('Failed to notify designer on task create', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(task.assigneeId);

        const hodMsg = `${task.taskNo} — ${task.project?.name ?? 'Unknown Project'} created and assigned to ${task.assignee?.fullName ?? 'a designer'}.`;
        const stakeholderIds = await this.resolveHodAdminAndSalesNotifyIds(task.project, {
          taskId: task.id,
        });
        for (const stakeholderId of stakeholderIds) {
          if (stakeholderId !== task.assigneeId) {
            this.notificationsService
              .create({ userId: stakeholderId, title: 'New Task Assigned', message: hodMsg, linkUrl: taskLink })
              .catch((err) => this.logger.error('Failed to notify HOD on task create', err));
            this.dashboardRealtime?.notifyUserNotificationRefresh(stakeholderId);
          }
        }
      }
    }

    const normalized = await Promise.all(
      createdTasks
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .map(async (t) => {
          const withUrls = await this.withSignedAttachmentUrls(t);
          return this.normalizeTaskForApi(withUrls);
        }),
    );
    return { tasks: normalized, count: normalized.length };
  }

  async uploadTaskFile(file: Express.Multer.File, userId: string) {
    const uploaded = await this.taskFilesService.uploadTaskFile(file, userId);
    await this.activityLogger.log({
      action: ActivityAction.TASK_FILE_UPLOADED,
      userId,
      taskId: null,
      details: {
        event: ActivityAction.TASK_FILE_UPLOADED,
        messageKey: 'task_file_uploaded',
        fileMeta: {
          fileName: uploaded.fileName,
          fileKey: uploaded.key,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.size,
        },
        context: { source: 'tasks.upload-file' },
      },
    });
    return uploaded;
  }

  async findAll(userId: string, role: UserRole, filters: TaskFilters = {}) {
    const {
      projectId,
      status,
      excludeStatuses,
      priority,
      assigneeId,
      search,
      type,
      salesPerson,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      salesQueue = false,
      salesHistory = false,
    } = filters;
    const skip = (page - 1) * limit;

    // Role-based base filters — preserve sales review queue / history when requested.
    // Queue keeps active Sales Review work plus temporary holds parked from Sales Review
    // so Sales can resume without hunting History.
    let baseWhere: Record<string, unknown> = {};
    if (role === UserRole.SALESPERSON && salesQueue) {
      baseWhere = {
        OR: [
          { status: 'SALES_REVIEW' },
          { status: 'ON_HOLD', holdPreviousStatus: 'SALES_REVIEW' },
        ],
      };
    } else if (role === UserRole.SALESPERSON && salesHistory) {
      // Distinct task ids only — no growing activity take(500–1000). Pagination stays on Task.
      const historyTaskIds = await this.findSalesHistoryTaskIds(userId);
      if (historyTaskIds.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      baseWhere = {
        id: { in: historyTaskIds },
        status: { not: 'SALES_REVIEW' },
        // Active sales holds stay in Queue, not History.
        NOT: {
          AND: [{ status: 'ON_HOLD' }, { holdPreviousStatus: 'SALES_REVIEW' }],
        },
      };
    }
    const addAndFilter = (condition: Record<string, unknown>) => {
      baseWhere.AND = [...((baseWhere.AND as Record<string, unknown>[] | undefined) ?? []), condition];
    };

    if (role === UserRole.DESIGNER) {
      // Include tasks assigned directly OR via the junction table (split tasks)
      addAndFilter({
        OR: [
          { assigneeId: userId },
          { taskDesigners: { some: { designerId: userId } } },
        ],
      });
    }

    if (role === UserRole.QS) {
      const assignedProjectIds = await this.getAssignedProjectIdsForQsUser(userId);
      if (assignedProjectIds.length === 0) {
        return {
          data: [],
          total: 0,
          page,
          limit,
          totalPages: 0,
        };
      }
      baseWhere.projectId = { in: assignedProjectIds };
    }

    if (projectId) baseWhere.projectId = projectId;
    if (status) baseWhere.status = toDbTaskStatus(status);
    if (excludeStatuses) {
      const excluded = excludeStatuses
        .split(',')
        .map((s) => toDbTaskStatus(s))
        .filter(Boolean);
      if (excluded.length > 0) addAndFilter({ status: { notIn: excluded } });
    }
    if (priority) baseWhere.priority = priority;
    if (assigneeId) {
      addAndFilter({
        OR: [
          { assigneeId },
          { taskDesigners: { some: { designerId: assigneeId } } },
        ],
      });
    }
    if (search) {
      const searchOr = [
        { title: { contains: search } },
        { opNo: { contains: search } },
        { description: { contains: search } },
      ];
      addAndFilter({ OR: searchOr });
    }

    const projectFilter: Record<string, unknown> = {};
    const typeNorm = String(type ?? '').trim().toLowerCase();
    if (typeNorm === 'retail' || typeNorm === 'project') {
      // FE maps designType from project.category (Retail / Project).
      projectFilter.category = typeNorm === 'retail' ? 'Retail' : 'Project';
    }
    const salesNorm = String(salesPerson ?? '').trim();
    if (salesNorm) {
      projectFilter.salesPerson = salesNorm;
    }
    if (Object.keys(projectFilter).length > 0) {
      addAndFilter({ project: projectFilter });
    }

    const dueRange: Record<string, Date> = {};
    const start = String(startDate ?? '').trim();
    const end = String(endDate ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      dueRange.gte = new Date(`${start}T00:00:00.000Z`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      dueRange.lte = new Date(`${end}T23:59:59.999Z`);
    }
    if (Object.keys(dueRange).length > 0) {
      addAndFilter({ dueDate: dueRange });
    }

    // Sales design-list (no queue/history flag): scope to this salesperson's work
    // so Sales cannot pull the org-wide task catalog.
    // When projectId is set (task-creation / project details page), skip the name filter —
    // salesPerson on the project often won't match the logged-in user (e.g. Sithara viewing
    // FahadQuazi's OP), which hid tasks they just created.
    if (
      role === UserRole.SALESPERSON &&
      !salesQueue &&
      !salesHistory &&
      !salesPerson &&
      !projectId
    ) {
      const me = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true },
      });
      const myName = String(me?.fullName ?? '').trim();
      if (!myName) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      // ERP often stores salesPerson as firstName+lastName with no space ("FahadQuazi").
      const compactName = myName.replace(/\s+/g, '');
      const firstToken = myName.split(/\s+/)[0] ?? '';
      const nameVariants = [...new Set(
        [myName, compactName, firstToken.length >= 3 ? firstToken : '']
          .map((v) => v.trim())
          .filter(Boolean),
      )];
      addAndFilter({
        OR: [
          ...nameVariants.map((variant) => ({
            project: { salesPerson: { contains: variant } },
          })),
          // Projects this sales user created locally
          { project: { createdById: userId } },
          // Tasks they personally created (even on another salesPerson's OP)
          {
            activityLogs: {
              some: { userId, action: ActivityAction.TASK_CREATED },
            },
          },
        ],
      });
    }

    const [data, total] = await Promise.all([
      this.prisma.task.findMany({
        where: baseWhere,
        select: TASK_LIST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.task.count({ where: baseWhere }),
    ]);

    // Batch latest submitted-session durations for list rows (kills N+1 timer UI fetches).
    const submittedDurationByTaskId = new Map<string, number>();
    const taskIds = data.map((t) => t.id).filter(Boolean);
    if (taskIds.length > 0) {
      const sessions = await this.prisma.taskWorkSession.findMany({
        where: { taskId: { in: taskIds }, status: 'Submitted' },
        orderBy: { submittedAt: 'desc' },
        select: { taskId: true, durationSeconds: true },
      });
      for (const session of sessions) {
        if (!submittedDurationByTaskId.has(session.taskId)) {
          submittedDurationByTaskId.set(session.taskId, session.durationSeconds);
        }
      }
    }

    return {
      data: data.map((task) => ({
        ...this.normalizeTaskForApi(task),
        submittedDurationSeconds: submittedDurationByTaskId.get(task.id) ?? null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Distinct task ids the salesperson already decided on after Sales Review
   * (accepted / rejected / rework / other leave from SALES_REVIEW).
   * Active ON_HOLD parked from Sales Review is excluded by findAll's salesHistory filter
   * so those remain in the Queue for Resume.
   *
   * Uses DISTINCT over activity rows (no take 500–1000 cap) so deep pages stay correct;
   * findAll then paginates Task rows with skip/limit.
   */
  private async findSalesHistoryTaskIds(salesUserId: string): Promise<string[]> {
    const approved = ActivityAction.CLIENT_APPROVED;
    const rejected = ActivityAction.CLIENT_REJECTED_TASK;
    const statusChanged = ActivityAction.STATUS_CHANGED;
    const salesReviewMarker = '%"oldStatus":"SALES_REVIEW"%';

    const rows = await this.prisma.$queryRaw<Array<{ taskId: string }>>(Prisma.sql`
      SELECT DISTINCT [taskId] AS [taskId]
      FROM [ErpTSActivityLog]
      WHERE [userId] = ${salesUserId}
        AND [taskId] IS NOT NULL
        AND (
          [action] = ${approved}
          OR [action] = ${rejected}
          OR (
            [action] = ${statusChanged}
            AND [details] LIKE ${salesReviewMarker}
          )
        )
    `);

    return rows.map((row) => row.taskId).filter(Boolean);
  }

  /** Sidebar backlog only — unassigned + on-hold, excluding completed. */
  async findSchedulerQueue(): Promise<{ data: SchedulerTaskSummaryDto[] }> {
    const rows = await this.prisma.task.findMany({
      where: schedulerQueueWhere(),
      select: SCHEDULER_TASK_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return { data: rows.map((task) => mapSchedulerTaskSummary(task)) };
  }

  async findOne(
    id: string,
    userId?: string,
    role?: UserRole,
    options: { view?: 'core' | 'full' } = {},
  ) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const view = options.view === 'core' ? 'core' : 'full';
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: view === 'core' ? TASK_CORE_SELECT : TASK_SELECT,
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertQsTaskAccess(id, userId, role);

    if (view === 'core') {
      const people = await this.getTaskPeopleLabels(id, task);
      return {
        ...this.normalizeTaskForApi(task as any),
        createdByName: people.createdByName,
        reviewerHodName: people.reviewerHodName,
        // Extras load separately — keep keys present so UI can show placeholders.
        schedulerHours: null,
        pendingReallocation: null,
        viewerCanRequestReallocation: false,
        viewerRemainingScheduledHours: 0,
      };
    }

    // Signed URLs, scheduler hours, and people labels are independent — run together.
    const [withUrls, schedulerHours, people, pendingReallocation, viewerRemainingHours] =
      await Promise.all([
        this.withSignedAttachmentUrls(task),
        this.getSchedulerHoursForTask(id, userId),
        this.getTaskPeopleLabels(id, task),
        this.prisma.reallocationRequest.findFirst({
          where: { taskId: id, status: 'Pending' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            requesterId: true,
            suggestedDesignerId: true,
            reason: true,
            requester: { select: { fullName: true } },
            suggestedDesigner: { select: { fullName: true } },
          },
        }),
        userId
          ? this.prisma.schedulerAssignment
              .findMany({
                where: { taskId: id, designerId: userId, isLocked: { not: true } },
                select: { assignedHours: true },
              })
              .then(
                (rows) =>
                  Math.round(
                    rows.reduce((sum, r) => sum + Number(r.assignedHours ?? 0), 0) * 100,
                  ) / 100,
              )
          : Promise.resolve(0),
      ]);

    const statusOk = ['DESIGN_PLANNED', 'IN_PROGRESS', 'REWORK'].includes(
      String(task.status ?? '').toUpperCase(),
    );
    const junctionDesignerIds = (task.taskDesigners ?? [])
      .map((entry: { designer?: { id?: string } | null }) => entry.designer?.id ?? null)
      .filter((id): id is string => Boolean(id));
    const ownsTask = Boolean(
      userId &&
        (task.assigneeId === userId || junctionDesignerIds.includes(userId)),
    );
    const myPending = Boolean(userId && pendingReallocation?.requesterId === userId);
    // Logged-remainder-only owners (post-reallocation) have 0 unlocked hours — hide CTA.
    const viewerCanRequestReallocation = Boolean(
      userId && statusOk && ownsTask && viewerRemainingHours >= 0.01 && !myPending,
    );

    return {
      ...this.normalizeTaskForApi(withUrls),
      schedulerHours,
      createdByName: people.createdByName,
      reviewerHodName: people.reviewerHodName,
      pendingReallocation: pendingReallocation
        ? {
            id: pendingReallocation.id,
            requesterId: pendingReallocation.requesterId,
            requesterName: pendingReallocation.requester.fullName,
            suggestedDesignerId: pendingReallocation.suggestedDesignerId,
            suggestedDesignerName: pendingReallocation.suggestedDesigner.fullName,
            reason: pendingReallocation.reason,
          }
        : null,
      viewerCanRequestReallocation,
      viewerRemainingScheduledHours: viewerRemainingHours,
    };
  }

  /**
   * Lazy extras for task detail: signed attachment URLs, scheduler hours, reallocation CTA.
   * Pair with GET /tasks/:id?view=core for first paint.
   */
  async findOneExtras(id: string, userId?: string, role?: UserRole) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        assigneeId: true,
        reworkAttachmentUrl: true,
        taskDesigners: { select: { designer: { select: { id: true } } } },
        retailDetails: {
          select: {
            id: true,
            providedFile: true,
            attachments: { select: TASK_ATTACHMENT_SELECT },
          },
        },
        projectDetails: {
          select: {
            id: true,
            attachments: { select: TASK_ATTACHMENT_SELECT },
          },
        },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    await this.assertQsTaskAccess(id, userId, role);

    const [withUrls, schedulerHours, pendingReallocation, viewerRemainingHours] =
      await Promise.all([
        this.withSignedAttachmentUrls(task as any),
        this.getSchedulerHoursForTask(id, userId),
        this.prisma.reallocationRequest.findFirst({
          where: { taskId: id, status: 'Pending' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            requesterId: true,
            suggestedDesignerId: true,
            reason: true,
            requester: { select: { fullName: true } },
            suggestedDesigner: { select: { fullName: true } },
          },
        }),
        userId
          ? this.prisma.schedulerAssignment
              .findMany({
                where: { taskId: id, designerId: userId, isLocked: { not: true } },
                select: { assignedHours: true },
              })
              .then(
                (rows) =>
                  Math.round(
                    rows.reduce((sum, r) => sum + Number(r.assignedHours ?? 0), 0) * 100,
                  ) / 100,
              )
          : Promise.resolve(0),
      ]);

    const statusOk = ['DESIGN_PLANNED', 'IN_PROGRESS', 'REWORK'].includes(
      String(task.status ?? '').toUpperCase(),
    );
    const junctionDesignerIds = (task.taskDesigners ?? [])
      .map((entry: { designer?: { id?: string } | null }) => entry.designer?.id ?? null)
      .filter((designerId): designerId is string => Boolean(designerId));
    const ownsTask = Boolean(
      userId &&
        (task.assigneeId === userId || junctionDesignerIds.includes(userId)),
    );
    const myPending = Boolean(userId && pendingReallocation?.requesterId === userId);
    const viewerCanRequestReallocation = Boolean(
      userId && statusOk && ownsTask && viewerRemainingHours >= 0.01 && !myPending,
    );

    return {
      schedulerHours,
      pendingReallocation: pendingReallocation
        ? {
            id: pendingReallocation.id,
            requesterId: pendingReallocation.requesterId,
            requesterName: pendingReallocation.requester.fullName,
            suggestedDesignerId: pendingReallocation.suggestedDesignerId,
            suggestedDesignerName: pendingReallocation.suggestedDesigner.fullName,
            reason: pendingReallocation.reason,
          }
        : null,
      viewerCanRequestReallocation,
      viewerRemainingScheduledHours: viewerRemainingHours,
      reworkAttachmentUrl: withUrls.reworkAttachmentUrl ?? null,
      retailDetails: withUrls.retailDetails ?? [],
      projectDetails: withUrls.projectDetails ?? [],
    };
  }

  /**
   * Created By = actor of TASK_CREATED (Sales or HOD).
   * Reviewer HOD = HOD/Admin who first assigned the task (activity), else retail hodName / technicalHead.
   */
  private async getTaskPeopleLabels(
    taskId: string,
    task: {
      technicalHead?: string | null;
      retailDetails?: Array<{ hodName?: string | null }> | null;
    },
  ) {
    const [created, assignedRows] = await Promise.all([
      this.prisma.activityLog.findFirst({
        where: { taskId, action: ActivityAction.TASK_CREATED },
        orderBy: { createdAt: 'asc' },
        select: { user: { select: { fullName: true } } },
      }),
      this.prisma.activityLog.findMany({
        where: { taskId, action: ActivityAction.ASSIGNED_TASK },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: {
          user: {
            select: {
              fullName: true,
              role: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const createdByName = created?.user?.fullName?.trim() || null;

    const retailHod =
      (task.retailDetails ?? [])
        .map((line) => String(line?.hodName ?? '').trim())
        .find((name) => name.length > 0) || null;

    const hodAssigner = assignedRows.find((row) => {
      const roleName = String(row.user?.role?.name ?? '').toUpperCase();
      return roleName === 'HOD' || roleName === 'ADMIN';
    });
    const anyAssigner = assignedRows[0]?.user?.fullName?.trim() || null;
    const technicalHead = String(task.technicalHead ?? '').trim() || null;

    const reviewerHodName =
      hodAssigner?.user?.fullName?.trim() ||
      retailHod ||
      technicalHead ||
      anyAssigner ||
      null;

    return { createdByName, reviewerHodName };
  }

  private async getSchedulerHoursForTask(taskId: string, viewerUserId?: string) {
    const [rows, sessions] = await Promise.all([
      this.prisma.schedulerAssignment.findMany({
        where: { taskId },
        select: {
          designerId: true,
          dayIndex: true,
          assignedHours: true,
          isLocked: true,
          designer: { select: { fullName: true } },
        },
        orderBy: [{ designerId: 'asc' }, { dayIndex: 'asc' }],
      }),
      this.prisma.taskWorkSession.findMany({
        where: {
          taskId,
          status: { in: ['Draft', 'HandedOff', 'Submitted'] },
        },
        select: { designerId: true, durationSeconds: true, runStartedAt: true, status: true },
      }),
    ]);

    const loggedSecondsByDesigner = new Map<string, number>();
    for (const session of sessions) {
      const key = session.designerId;
      const seconds =
        session.status === 'Draft'
          ? effectiveWorkSessionSeconds(session.durationSeconds, session.runStartedAt)
          : session.durationSeconds;
      loggedSecondsByDesigner.set(key, (loggedSecondsByDesigner.get(key) ?? 0) + seconds);
    }

    const partsByDesigner = new Map<
      string,
      { designerId: string; designerName: string; assignedHours: number; loggedHours: number; sliceCount: number }
    >();
    for (const row of rows) {
      if (!row.designerId) continue;
      const hours = Number(row.assignedHours) || 0;
      if (hours <= 0) continue;
      const existing = partsByDesigner.get(row.designerId);
      if (existing) {
        existing.assignedHours += hours;
        existing.sliceCount += 1;
      } else {
        partsByDesigner.set(row.designerId, {
          designerId: row.designerId,
          designerName: row.designer?.fullName?.trim() || 'Designer',
          assignedHours: hours,
          loggedHours: 0,
          sliceCount: 1,
        });
      }
    }

    const parts = Array.from(partsByDesigner.values())
      .map((part) => {
        const loggedSeconds = loggedSecondsByDesigner.get(part.designerId) ?? 0;
        const loggedHours = workedHoursFromSeconds(loggedSeconds);
        const assignedHours = Math.round(part.assignedHours * 100) / 100;
        return {
          designerId: part.designerId,
          designerName: part.designerName,
          hours: assignedHours,
          assignedHours,
          loggedHours,
          sliceCount: part.sliceCount,
          overAssignedHours: Math.round(Math.max(0, loggedHours - assignedHours) * 100) / 100,
        };
      })
      .filter((part) => part.assignedHours > 0)
      .sort((a, b) => b.assignedHours - a.assignedHours);

    const totalAssignedHours = Math.round(parts.reduce((sum, part) => sum + part.assignedHours, 0) * 100) / 100;
    // Sum all work sessions (Draft/HandedOff/Submitted), not only designers still on the grid.
    let totalLoggedSeconds = 0;
    for (const seconds of loggedSecondsByDesigner.values()) {
      totalLoggedSeconds += seconds;
    }
    const totalLoggedHours = workedHoursFromSeconds(totalLoggedSeconds);
    const myPart = viewerUserId ? parts.find((part) => part.designerId === viewerUserId) : undefined;
    // Designer may have submitted time without a remaining assignment row — still expose myLoggedHours.
    const myLoggedSeconds = viewerUserId ? (loggedSecondsByDesigner.get(viewerUserId) ?? 0) : 0;
    const myLoggedHours =
      myPart?.loggedHours ??
      (myLoggedSeconds > 0 ? workedHoursFromSeconds(myLoggedSeconds) : null);

    let myApprovedOvertimeHours: number | null = null;
    let myPendingOvertimeHours: number | null = null;
    if (viewerUserId) {
      const todayDate = new Date(`${utcDateOnlyString()}T00:00:00.000Z`);
      const overtimeRows = await this.prisma.overtimeRequest.findMany({
        where: {
          taskId,
          designerId: viewerUserId,
          date: todayDate,
        },
        select: {
          status: true,
          approvedHours: true,
          requestedHours: true,
          totalHours: true,
        },
      });
      const otSummary = summarizeViewerOvertimeHours(overtimeRows);
      myApprovedOvertimeHours =
        otSummary.myApprovedOvertimeHours > 0 ? otSummary.myApprovedOvertimeHours : null;
      myPendingOvertimeHours =
        otSummary.myPendingOvertimeHours > 0 ? otSummary.myPendingOvertimeHours : null;
    }

    return {
      totalHours: totalAssignedHours,
      totalAssignedHours,
      totalLoggedHours,
      myHours: myPart?.assignedHours ?? null,
      myAssignedHours: myPart?.assignedHours ?? null,
      myLoggedHours,
      myOverAssignedHours: myPart?.overAssignedHours ?? null,
      myApprovedOvertimeHours,
      myPendingOvertimeHours,
      parts,
    };
  }

  async peekDraftWorkSession(taskId: string, designerId: string) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    if (!this.isUuid(designerId)) throw new BadRequestException('Invalid designer id');
    const peek = await this.readDesignerWorkSeconds(taskId, designerId);
    return {
      workedSeconds: peek.totalSeconds,
      workedHours: workedHoursFromSeconds(peek.totalSeconds),
      hadRunningTimer: peek.hadRunningTimer,
    };
  }

  private async readDesignerWorkSeconds(taskId: string, designerId: string) {
    const sessions = await this.prisma.taskWorkSession.findMany({
      where: { taskId, designerId, status: { in: ['Draft', 'HandedOff'] } },
      select: { durationSeconds: true, runStartedAt: true, status: true },
      orderBy: { createdAt: 'desc' },
    });

    let totalSeconds = 0;
    let hadRunningTimer = false;
    for (const session of sessions) {
      if (session.status === 'Draft') {
        totalSeconds += effectiveWorkSessionSeconds(session.durationSeconds, session.runStartedAt);
        hadRunningTimer = hadRunningTimer || session.runStartedAt != null;
      } else {
        totalSeconds += session.durationSeconds;
      }
    }
    return { totalSeconds: normalizeWorkSeconds(totalSeconds), hadRunningTimer };
  }

  async update(id: string, dto: UpdateTaskDto, _actingUserId: string, role: UserRole | string) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const existing = await this.prisma.task.findUnique({
      where: { id },
      include: {
        retailDetails: { select: { id: true, hoursRequired: true, deadline: true } },
        projectDetails: {
          select: {
            id: true,
            artwork: true,
            artworkHours: true,
            technical: true,
            technicalHours: true,
            location: true,
            locationHours: true,
            asBuilt: true,
            asBuiltHours: true,
            deadline: true,
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('Task not found');

    if (dto.hoursRequired !== undefined) {
      if (role !== UserRole.HOD) {
        throw new ForbiddenException('Only the Design HOD can edit task hours');
      }
      await this.applyHodHoursUpdate(existing, dto.hoursRequired);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        technicalHead: dto.technicalHead !== undefined ? (dto.technicalHead?.trim() || null) : undefined,
        teamLead: dto.teamLead !== undefined ? (dto.teamLead?.trim() || null) : undefined,
        subTeamLead: dto.subTeamLead !== undefined ? (dto.subTeamLead?.trim() || null) : undefined,
        designers: dto.designers !== undefined ? (dto.designers?.trim() || null) : undefined,
      },
      select: TASK_SELECT,
    });
    const withUrls = await this.withSignedAttachmentUrls(updated);
    return this.normalizeTaskForApi(withUrls);
  }

  private assertEditableTaskHours(hours: number, deadline?: Date | string | null) {
    if (!Number.isFinite(hours) || hours < 1) {
      throw new BadRequestException('Hours Required must be a number (min 1)');
    }
    if (!deadline) return;
    const check = assertHoursWithinDeadline(hours, deadline);
    if (!check.ok && check.workingDays > 0) {
      throw new BadRequestException(check.message);
    }
  }

  private projectHoursPatch(
    detail: {
      artwork?: boolean | null;
      artworkHours?: number | null;
      technical?: boolean | null;
      technicalHours?: number | null;
      location?: boolean | null;
      locationHours?: number | null;
      asBuilt?: boolean | null;
      asBuiltHours?: number | null;
    },
    disciplineType: string | null,
    hours: number,
  ): {
    artworkHours?: number;
    technicalHours?: number;
    locationHours?: number;
    asBuiltHours?: number;
  } {
    const disc = String(disciplineType ?? '').trim().toLowerCase();
    if (disc === 'artwork' || detail.artwork) return { artworkHours: hours };
    if (disc === 'technical' || detail.technical) return { technicalHours: hours };
    if (disc === 'location' || detail.location) return { locationHours: hours };
    if (disc === 'as-built' || disc === 'as built' || disc === 'asbuilt' || detail.asBuilt) {
      return { asBuiltHours: hours };
    }
    if ((Number(detail.artworkHours) || 0) > 0) return { artworkHours: hours };
    if ((Number(detail.technicalHours) || 0) > 0) return { technicalHours: hours };
    if ((Number(detail.locationHours) || 0) > 0) return { locationHours: hours };
    if ((Number(detail.asBuiltHours) || 0) > 0) return { asBuiltHours: hours };
    return { artworkHours: hours };
  }

  private async applyHodHoursUpdate(
    existing: {
      dueDate?: Date | null;
      disciplineType?: string | null;
      retailDetails?: Array<{ id: string; hoursRequired?: number | null; deadline?: Date | null }>;
      projectDetails?: Array<{
        id: string;
        artwork?: boolean | null;
        artworkHours?: number | null;
        technical?: boolean | null;
        technicalHours?: number | null;
        location?: boolean | null;
        locationHours?: number | null;
        asBuilt?: boolean | null;
        asBuiltHours?: number | null;
        deadline?: Date | null;
      }>;
    },
    rawHours: number,
  ) {
    const hours = Math.round(Number(rawHours));
    const retailLines = existing.retailDetails ?? [];
    const projectLines = existing.projectDetails ?? [];
    const deadline =
      retailLines[0]?.deadline ?? projectLines[0]?.deadline ?? existing.dueDate ?? null;
    this.assertEditableTaskHours(hours, deadline);

    if (retailLines.length > 0) {
      await this.prisma.retailTaskDetail.update({
        where: { id: retailLines[0].id },
        data: { hoursRequired: hours },
      });
      for (const line of retailLines.slice(1)) {
        if ((Number(line.hoursRequired) || 0) === 0) continue;
        await this.prisma.retailTaskDetail.update({
          where: { id: line.id },
          data: { hoursRequired: 0 },
        });
      }
      return;
    }

    if (projectLines.length > 0) {
      const detail = projectLines[0];
      await this.prisma.projectTaskDetail.update({
        where: { id: detail.id },
        data: this.projectHoursPatch(detail, existing.disciplineType ?? null, hours),
      });
      return;
    }

    throw new BadRequestException('This task has no hours to update');
  }

  async assign(id: string, actingUserId: string, dto: AssignTaskDto) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');

    if (isTaskReassignmentBlocked(existing.status)) {
      throw new BadRequestException(TASK_REASSIGNMENT_BLOCKED_MESSAGE);
    }

    const [assignee, oldAssignee, existingSplitDesigners] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.assigneeId } }),
      existing.assigneeId ? this.prisma.user.findUnique({ where: { id: existing.assigneeId }, select: { fullName: true } }) : null,
      this.prisma.taskDesigner.findMany({ where: { taskId: id }, select: { designerId: true } }),
    ]);
    if (!assignee) throw new NotFoundException('Assignee not found');

    // Split tasks have assigneeId=null with real designers only in the taskDesigners junction —
    // read both so reassigning a split task is recognized as a reassignment and the designers
    // being removed are notified, not just whoever happened to hold the single assigneeId field.
    const previousDesignerIds = new Set(
      [existing.assigneeId, ...existingSplitDesigners.map((d) => d.designerId)].filter(
        (value): value is string => !!value,
      ),
    );
    const isReassignment =
      previousDesignerIds.size > 0 && !(previousDesignerIds.size === 1 && previousDesignerIds.has(dto.assigneeId));
    const removedDesignerIds = Array.from(previousDesignerIds).filter((designerId) => designerId !== dto.assigneeId);

    const rawStatus = String(existing.status ?? '').toUpperCase();
    const shouldPromote = rawStatus === 'DESIGN_NEW';
    const updatedTask = await this.prisma.task.update({
      where: { id },
      data: { assigneeId: dto.assigneeId, ...(shouldPromote ? { status: 'DESIGN_PLANNED' } : {}) },
      select: TASK_SELECT,
    });

    // Keep junction table in sync with direct assignment
    await this.prisma.taskDesigner.deleteMany({ where: { taskId: id } });
    await this.prisma.taskDesigner.create({ data: { taskId: id, designerId: dto.assigneeId } });

    await this.activityLogger.log({
      action: ActivityAction.ASSIGNED_TASK,
      userId: actingUserId,
      taskId: id,
      details: {
        event: ActivityAction.ASSIGNED_TASK,
        messageKey: 'task_assigned',
        taskSnapshot: {
          id: updatedTask.id,
          taskNo: updatedTask.taskNo,
          opNo: updatedTask.opNo,
          title: updatedTask.title ?? undefined,
          status: updatedTask.status,
        },
        projectSnapshot: {
          id: updatedTask.project?.id,
          projectNo: updatedTask.project?.projectNo,
          name: updatedTask.project?.name,
        },
        changes: {
          assigneeId: dto.assigneeId,
          newAssigneeName: assignee.fullName,
          oldAssigneeId: existing.assigneeId ?? null,
          oldAssigneeName: oldAssignee?.fullName ?? null,
        },
        context: { source: 'tasks.assign' },
      },
    });

    if (isReassignment) {
      this.dashboardRealtime?.notifyOverviewRefresh('task_reassigned', {
        taskId: id,
        changedTaskIds: [id],
      });
    }

    const linkUrlAssign =
      taskViewPath(id, updatedTask.designType);
    const assignMessage = `${updatedTask.taskNo} — ${updatedTask.project?.name ?? 'Unknown Project'} has been assigned to ${assignee.fullName}`;
    const stakeholderIdsAssign = await this.resolveHodAdminAndSalesNotifyIds(updatedTask.project, {
      taskId: id,
    });
    this.notificationsService
      .create({ userId: dto.assigneeId, title: 'Task Assigned to You', message: assignMessage, linkUrl: linkUrlAssign })
      .catch((err) => this.logger.error('Failed to send assign notification to designer', err));
    this.dashboardRealtime?.notifyUserNotificationRefresh(dto.assigneeId);
    for (const stakeholderId of stakeholderIdsAssign) {
      if (stakeholderId !== dto.assigneeId) {
        this.notificationsService
          .create({ userId: stakeholderId, title: 'Task Assigned', message: assignMessage, linkUrl: linkUrlAssign })
          .catch((err) => this.logger.error('Failed to send assign notification to HOD', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(stakeholderId);
      }
    }
    // Tell every designer removed from this task (including former split designers) that
    // they no longer have it — they'd otherwise get no signal at all.
    const removedMessage = `${updatedTask.taskNo} — ${updatedTask.project?.name ?? 'Unknown Project'} has been reassigned to ${assignee.fullName}; you are no longer assigned to it.`;
    for (const removedDesignerId of removedDesignerIds) {
      this.notificationsService
        .create({ userId: removedDesignerId, title: 'Removed from Task', message: removedMessage, linkUrl: linkUrlAssign })
        .catch((err) => this.logger.error('Failed to send removed-from-task notification', err));
      this.dashboardRealtime?.notifyUserNotificationRefresh(removedDesignerId);
    }

    const withUrls = await this.withSignedAttachmentUrls(updatedTask);
    return this.normalizeTaskForApi(withUrls);
  }

  /**
   * Preview of what `updateStatus(..., ON_HOLD)` would remove from the scheduler grid —
   * every current/future SchedulerAssignment row for this task, grouped by designer. Lets
   * the "Put On Hold" button warn the user before the unconditional whole-task wipe fires.
   */
  async getHoldImpact(taskId: string) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const todayMidnight = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
    const rows = await this.prisma.schedulerAssignment.findMany({
      where: { taskId, weekStartDate: { gte: todayMidnight } },
      select: { designerId: true, designer: { select: { fullName: true } } },
    });

    const countByDesigner = new Map<string, { designerId: string; designerName: string; partCount: number }>();
    for (const row of rows) {
      if (!row.designerId) continue;
      const existing = countByDesigner.get(row.designerId);
      if (existing) {
        existing.partCount += 1;
      } else {
        countByDesigner.set(row.designerId, {
          designerId: row.designerId,
          designerName: row.designer?.fullName?.trim() || 'Designer',
          partCount: 1,
        });
      }
    }

    return {
      partCount: rows.length,
      designers: Array.from(countByDesigner.values()).sort((a, b) => b.partCount - a.partCount),
    };
  }

  async updateStatus(id: string, userId: string, role: UserRole, dto: UpdateTaskStatusDto) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    if (role === UserRole.DESIGNER && existing.assigneeId !== userId) {
      const inJunction = await this.prisma.taskDesigner.findUnique({
        where: { taskId_designerId: { taskId: id, designerId: userId } },
      });
      if (!inJunction) throw new ForbiddenException('Designers can only update status on their own tasks');
    }

    // REWORK = same revision (HOD internal or Sales). CLIENT_REJECTED = new Rn (Sales/Admin only).
    const newStatusApi = toApiTaskStatus(dto.status);
    if (newStatusApi === 'REWORK') {
      if (
        role !== UserRole.SALESPERSON &&
        role !== UserRole.ADMIN &&
        role !== UserRole.HOD
      ) {
        throw new ForbiddenException('Only HOD, SALESPERSON, or ADMIN can issue rework');
      }
    } else if (newStatusApi === 'CLIENT_REJECTED') {
      if (role !== UserRole.SALESPERSON && role !== UserRole.ADMIN) {
        throw new ForbiddenException('Only SALESPERSON or ADMIN can mark client rejected');
      }
    }

    // Sales may only change status once the task is in Sales Review (or hold parked from there).
    // Prevents Sales from starting HOD review / sending to sales / holding earlier stages.
    const currentStatusApiForSales = toApiTaskStatus(existing.status);
    if (role === UserRole.SALESPERSON) {
      const holdPrevApi = existing.holdPreviousStatus
        ? toApiTaskStatus(existing.holdPreviousStatus)
        : null;
      const inSalesScope =
        currentStatusApiForSales === 'SALES_REVIEW' ||
        (currentStatusApiForSales === 'ON_HOLD' && holdPrevApi === 'SALES_REVIEW');
      if (!inSalesScope) {
        throw new ForbiddenException(
          'Salesperson can only update tasks that are in Sales Review',
        );
      }
    }

    // Auto-track startedAt / completedAt timestamps
    const now = new Date();
    let newStatusDb = toDbTaskStatus(dto.status);
    const extraData: Record<string, unknown> = {};

    // Going INTO ON_HOLD — store current status so it can be restored later
    if (newStatusApi === 'ON_HOLD') {
      extraData.holdPreviousStatus = existing.status;
    }

    // Coming OUT of ON_HOLD — restore the previously stored status regardless of what was sent
    const currentStatusApi = currentStatusApiForSales;
    if (currentStatusApi === 'ON_HOLD' && newStatusApi !== 'ON_HOLD') {
      newStatusDb = existing.holdPreviousStatus ?? newStatusDb;
      extraData.holdPreviousStatus = null;
    }

    // Use the effective status (after ON_HOLD restore) for timestamps, logging, and notifications
    const effectiveStatusApi = toApiTaskStatus(newStatusDb);

    if (effectiveStatusApi === 'IN_PROGRESS' && !existing.startedAt) extraData.startedAt = now;
    if (COMPLETED_STATUS_FILTER.includes(effectiveStatusApi)) extraData.completedAt = now;

    // REWORK stays on the same task — persist instructions alongside the status flip
    if (effectiveStatusApi === 'REWORK') {
      extraData.reworkNote = dto.reworkNote?.trim() || null;
      extraData.reworkAttachmentUrl = this.toStoredS3ObjectKey(dto.reworkAttachmentUrl);
      extraData.reworkAttachmentName = dto.reworkAttachmentName || null;
      extraData.reworkLinkUrl = dto.reworkLinkUrl || null;
      extraData.reworkLinkName = dto.reworkLinkName || null;
    }

    let updatedTask: Awaited<ReturnType<typeof this.prisma.task.findUniqueOrThrow>>;

    // ON_HOLD: status update + future-assignment wipe (and optional consolidation guard) must
    // run in one transaction. Without that, a sibling row created between the expected-ids
    // check and deleteMany would still be wiped even though the guard "passed" — matching
    // clearTaskSchedule's atomic check+delete.
    //
    // Keep the interactive transaction write-only (no TASK_SELECT joins). Remote SQL Server
    // already needs ~5–7s for a full task read, which blows Prisma's default 5s tx timeout
    // (P2028) if the heavy select runs inside the transaction.
    if (newStatusApi === 'ON_HOLD') {
      const todayMidnight = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00.000Z');
      await this.prisma.$transaction(
        async (tx) => {
          if (dto.expectedAssignmentIds) {
            const liveRows = await tx.schedulerAssignment.findMany({
              where: { taskId: id, weekStartDate: { gte: todayMidnight } },
              select: { id: true },
            });
            const expected = new Set(dto.expectedAssignmentIds);
            if (liveRows.some((row) => !expected.has(row.id))) {
              throw new ConflictException(
                'Another scheduled part of this task changed since this page last loaded. Refresh and try again.',
              );
            }
          }

          await tx.task.update({
            where: { id },
            data: { status: newStatusDb, ...extraData },
          });

          await tx.schedulerAssignment.deleteMany({
            where: { taskId: id, weekStartDate: { gte: todayMidnight } },
          });
        },
        { timeout: 15_000 },
      );

      updatedTask = await (this.prisma.task.findUniqueOrThrow as any)({
        where: { id },
        select: TASK_STATUS_SELECT,
      });
    } else {
      updatedTask = await (this.prisma.task.update as any)({
        where: { id },
        data: { status: newStatusDb, ...extraData },
        select: TASK_STATUS_SELECT,
      });
    }

    const milestoneAction =
      effectiveStatusApi === 'DESIGN_COMPLETED' ? ActivityAction.TASK_COMPLETED :
      effectiveStatusApi === 'CLIENT_ACCEPTED' ? ActivityAction.CLIENT_APPROVED :
      effectiveStatusApi === 'CLIENT_REJECTED'  ? ActivityAction.CLIENT_REJECTED_TASK :
      null;
    const logAction = milestoneAction ?? ActivityAction.STATUS_CHANGED;
    const messageKey = milestoneAction ? logAction.toLowerCase() : 'status_changed';

    await this.activityLogger.log({
      action: logAction,
      userId,
      taskId: id,
      details: {
        event: logAction,
        messageKey,
        taskSnapshot: {
          id: (updatedTask as any).id,
          taskNo: (updatedTask as any).taskNo,
          opNo: (updatedTask as any).opNo,
          title: (updatedTask as any).title ?? undefined,
          status: (updatedTask as any).status,
        },
        projectSnapshot: {
          id: (updatedTask as any).project?.id,
          projectNo: (updatedTask as any).project?.projectNo,
          name: (updatedTask as any).project?.name,
        },
        changes: {
          oldStatus: toApiTaskStatus(existing.status),
          newStatus: effectiveStatusApi,
        },
        context: {
          source:
            effectiveStatusApi === 'REWORK' && role === UserRole.HOD
              ? 'hod_internal_rework'
              : 'tasks.updateStatus',
        },
      },
    });

    if (COMPLETED_STATUS_FILTER.includes(effectiveStatusApi)) {
      this.dashboardRealtime?.notifyOverviewRefresh('task_completed', {
        taskId: id,
        status: effectiveStatusApi,
        changedTaskIds: [id],
      });
    } else {
      this.dashboardRealtime?.notifyOverviewRefresh('task_status_changed', {
        taskId: id,
        status: effectiveStatusApi,
        changedTaskIds: [id],
      });
    }

    if (COMPLETED_STATUS_FILTER.includes(effectiveStatusApi)) {
      const linkUrlStatus =
        taskViewPath(id, (updatedTask as any).designType);
      const statusMessage = `${(updatedTask as any).taskNo} — ${(updatedTask as any).project?.name ?? 'Unknown Project'} status changed to ${effectiveStatusApi}`;
      const stakeholderIdsStatus = await this.resolveHodAdminAndSalesNotifyIds(
        (updatedTask as any).project,
        { taskId: id },
      );
      if ((updatedTask as any).assigneeId) {
        this.notificationsService
          .create({ userId: (updatedTask as any).assigneeId, title: 'Task Marked Complete', message: statusMessage, linkUrl: linkUrlStatus })
          .catch((err) => this.logger.error('Failed to send complete notification to designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh((updatedTask as any).assigneeId);
      }
      // Notify split-task designers (junction table) who don't have assigneeId
      const splitDesignersComplete = await this.prisma.taskDesigner.findMany({
        where: {
          taskId: id,
          ...((updatedTask as any).assigneeId
            ? { NOT: { designerId: (updatedTask as any).assigneeId } }
            : {}),
        },
        select: { designerId: true },
      });
      for (const { designerId } of splitDesignersComplete) {
        this.notificationsService
          .create({ userId: designerId, title: 'Task Marked Complete', message: statusMessage, linkUrl: linkUrlStatus })
          .catch((err) => this.logger.error('Failed to send complete notification to split designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(designerId);
      }
      for (const stakeholderId of stakeholderIdsStatus) {
        if (stakeholderId !== (updatedTask as any).assigneeId) {
          this.notificationsService
            .create({ userId: stakeholderId, title: 'Task Completed', message: statusMessage, linkUrl: linkUrlStatus })
            .catch((err) => this.logger.error('Failed to send complete notification to HOD', err));
          this.dashboardRealtime?.notifyUserNotificationRefresh(stakeholderId);
        }
      }
    }

    // HOD_REVIEW — notify HOD/ADMIN users that a task is waiting for their review
    if (effectiveStatusApi === 'HOD_REVIEW') {
      const linkUrlHodReview =
        taskViewPath(id, (updatedTask as any).designType);
      const hodReviewMessage = `${(updatedTask as any).taskNo} — ${(updatedTask as any).project?.name ?? 'Unknown Project'} is ready for HOD review.`;
      const hodReviewers = await this.prisma.user.findMany({
        where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
        select: { id: true },
      });
      for (const hod of hodReviewers) {
        this.notificationsService
          .create({ userId: hod.id, title: `Task Ready for HOD Review — ${(updatedTask as any).taskNo}`, message: hodReviewMessage, linkUrl: linkUrlHodReview })
          .catch((err) => this.logger.error('Failed to send HOD-review notification', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id);
      }
    }

    // CLIENT_REJECTED — create next revision first, then notify designers with link to the new task
    let revisionResult: { id: string; taskNo: string } | null = null;
    if (effectiveStatusApi === 'CLIENT_REJECTED') {
      try {
        revisionResult = await this.createRevisionFromClientReject(existing, dto, userId);
      } catch (err) {
        // Don't leave the old task CLIENT_REJECTED without a DESIGN_NEW successor.
        this.logger.error('createRevisionFromClientReject failed — rolling back status', err);
        await this.prisma.task
          .update({
            where: { id },
            data: {
              status: existing.status,
              completedAt: existing.completedAt,
              holdPreviousStatus: existing.holdPreviousStatus,
            },
          })
          .catch((rollbackErr) =>
            this.logger.error('Failed to roll back status after revision create failure', rollbackErr),
          );
        throw err;
      }

      const linkUrlClientRejected =
        taskViewPath(revisionResult.id, (updatedTask as any).designType);
      const clientRejectedMessage =
        `${(updatedTask as any).taskNo} — ${(updatedTask as any).project?.name ?? 'Unknown Project'} was rejected by the client. ` +
        `New revision ${revisionResult.taskNo} created and is awaiting assignment.`;
      if ((updatedTask as any).assigneeId) {
        this.notificationsService
          .create({ userId: (updatedTask as any).assigneeId, title: 'Client Rejected Task', message: clientRejectedMessage, linkUrl: linkUrlClientRejected })
          .catch((err) => this.logger.error('Failed to send client-rejected notification to designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh((updatedTask as any).assigneeId);
      }
      const splitDesignersRejected = await this.prisma.taskDesigner.findMany({
        where: {
          taskId: id,
          ...((updatedTask as any).assigneeId
            ? { NOT: { designerId: (updatedTask as any).assigneeId } }
            : {}),
        },
        select: { designerId: true },
      });
      for (const { designerId } of splitDesignersRejected) {
        this.notificationsService
          .create({ userId: designerId, title: 'Client Rejected Task', message: clientRejectedMessage, linkUrl: linkUrlClientRejected })
          .catch((err) => this.logger.error('Failed to send client-rejected notification to split designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(designerId);
      }
    }

    // ON_HOLD — notify the assignee and split designers whichever direction the transition goes
    const enteredHold = newStatusApi === 'ON_HOLD';
    const resumedFromHold = currentStatusApi === 'ON_HOLD' && newStatusApi !== 'ON_HOLD';
    if (enteredHold || resumedFromHold) {
      const linkUrlHold =
        taskViewPath(id, (updatedTask as any).designType);
      const holdTitle = enteredHold ? 'Task Put On Hold' : 'Task Resumed';
      const holdMessage = enteredHold
        ? `${(updatedTask as any).taskNo} — ${(updatedTask as any).project?.name ?? 'Unknown Project'} was put on hold; its scheduled slots were removed.`
        : `${(updatedTask as any).taskNo} — ${(updatedTask as any).project?.name ?? 'Unknown Project'} has resumed from hold.`;
      if ((updatedTask as any).assigneeId) {
        this.notificationsService
          .create({ userId: (updatedTask as any).assigneeId, title: holdTitle, message: holdMessage, linkUrl: linkUrlHold })
          .catch((err) => this.logger.error('Failed to send hold-transition notification to designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh((updatedTask as any).assigneeId);
      }
      const splitDesignersHold = await this.prisma.taskDesigner.findMany({
        where: {
          taskId: id,
          ...((updatedTask as any).assigneeId
            ? { NOT: { designerId: (updatedTask as any).assigneeId } }
            : {}),
        },
        select: { designerId: true },
      });
      for (const { designerId } of splitDesignersHold) {
        this.notificationsService
          .create({ userId: designerId, title: holdTitle, message: holdMessage, linkUrl: linkUrlHold })
          .catch((err) => this.logger.error('Failed to send hold-transition notification to split designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(designerId);
      }
    }

    // SALES_REVIEW — notify matched project sales + admin (not every salesperson)
    if (effectiveStatusApi === 'SALES_REVIEW') {
      const linkUrlSales =
        taskViewPath(id, (updatedTask as any).designType);
      const salesMessage = `${(updatedTask as any).taskNo} — ${(updatedTask as any).project?.name ?? 'Unknown Project'} is ready for your review.`;
      const salesReviewers = await this.resolveSalesReviewNotifyIds((updatedTask as any).project, {
        taskId: id,
      });
      for (const spId of salesReviewers) {
        this.notificationsService
          .create({ userId: spId, title: `Task Ready for Review — ${(updatedTask as any).taskNo}`, message: salesMessage, linkUrl: linkUrlSales })
          .catch((err) => this.logger.error('Failed to send sales-review notification', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(spId);
      }
    }

    // REWORK — same task stays with current designer(s); notify designers + stakeholders
    if (effectiveStatusApi === 'REWORK') {
      const taskLink =
        taskViewPath(id, (updatedTask as any).designType);
      const note = dto.reworkNote?.trim() ?? '';
      const reworkTitle = `Rework Issued — ${(updatedTask as any).taskNo}`;
      const reworkMessage = note || 'Task has been sent for rework.';
      const notifiedUserIds = new Set<string>();

      if ((updatedTask as any).assigneeId) {
        this.notificationsService
          .create({
            userId: (updatedTask as any).assigneeId,
            title: reworkTitle,
            message: reworkMessage,
            linkUrl: taskLink,
          })
          .catch((err) => this.logger.error('Failed to send rework notification', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh((updatedTask as any).assigneeId);
        notifiedUserIds.add((updatedTask as any).assigneeId);
      }
      const splitDesignersRework = await this.prisma.taskDesigner.findMany({
        where: {
          taskId: id,
          ...((updatedTask as any).assigneeId
            ? { NOT: { designerId: (updatedTask as any).assigneeId } }
            : {}),
        },
        select: { designerId: true },
      });
      for (const { designerId } of splitDesignersRework) {
        this.notificationsService
          .create({
            userId: designerId,
            title: reworkTitle,
            message: reworkMessage,
            linkUrl: taskLink,
          })
          .catch((err) => this.logger.error('Failed to send rework notification to split designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(designerId);
        notifiedUserIds.add(designerId);
      }

      // HOD / Admin / matched sales (skip actor + anyone already notified as designer)
      const reworkStakeholders = await this.resolveHodAdminAndSalesNotifyIds(
        (updatedTask as any).project,
        { taskId: id },
      );
      const stakeholderMessage =
        `${(updatedTask as any).taskNo} — ${(updatedTask as any).project?.name ?? 'Unknown Project'} was sent for rework.` +
        (note ? ` ${note}` : '');
      for (const stakeholderId of reworkStakeholders) {
        if (stakeholderId === userId || notifiedUserIds.has(stakeholderId)) continue;
        this.notificationsService
          .create({
            userId: stakeholderId,
            title: reworkTitle,
            message: stakeholderMessage,
            linkUrl: taskLink,
          })
          .catch((err) => this.logger.error('Failed to send rework notification to stakeholder', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(stakeholderId);
      }

      if (note) {
        const isHodInternal = role === UserRole.HOD;
        await this.prisma.chatterPost.create({
          data: {
            taskId: id,
            title: isHodInternal ? 'Internal Rework Instructions' : 'Rework Instructions',
            message: `${isHodInternal ? 'Internal Rework Required' : 'Rework Required'}:\n${note}`,
            postType: 'REWORK',
            authorId: userId,
          },
        }).catch((err) => this.logger.error('Failed to create rework chatter post', err));
      }
    }

    // Slim status payload — callers already hold the full task page and refresh extras as needed.
    // Avoid TASK_SELECT + S3 signing here (that path was ~5–7s and caused Hold P2028).
    const normalized = this.normalizeTaskForApi(updatedTask as any);
    return {
      id: normalized.id,
      taskNo: (normalized as any).taskNo,
      status: normalized.status,
      holdPreviousStatus: (normalized as any).holdPreviousStatus ?? null,
      designType: (normalized as any).designType ?? null,
      ...(revisionResult ? { newRevisionTaskId: revisionResult.id, newRevisionTaskNo: revisionResult.taskNo } : {}),
    };
  }

  private async createRevisionFromClientReject(
    originalTask: { id: string; projectId: string; opNo: string | null; designType: string | null; signType: string | null; signFamily: string | null; disciplineType: string | null; title: string | null; description: string | null; priority: string; dueDate: Date | null; technicalHead: string | null; teamLead: string | null; subTeamLead: string | null; designers: string | null },
    dto: UpdateTaskStatusDto,
    userId: string,
  ): Promise<{ id: string; taskNo: string }> {
    const opNo = originalTask.opNo ?? '';
    // Must match create / next-revision scope — raw "Estimation Purpose" vs ESTIMATION_PURPOSE
    // previously caused R0 to be minted again as DESIGN_NEW instead of R1.
    const designType = this.normalizeDesignType(originalTask.designType);

    // Fetch detail rows and attachments from the original task
    const originalFull = await this.prisma.task.findUnique({
      where: { id: originalTask.id },
      select: {
        phase: true,
        retailDetails: {
          select: {
            providedFile: true, fileKey: true, fileUrl: true, hodName: true,
            designTypes: true, hoursRequired: true, comment: true,
            signFamily: true, signType: true, planCode: true,
            contractRef: true, quantity: true, deadline: true,
            attachments: { select: { fileKey: true, fileName: true, mimeType: true, sizeBytes: true } },
          },
        },
        projectDetails: {
          select: {
            signType: true, planCode: true, area: true, level: true,
            artwork: true, artworkHours: true, technical: true, technicalHours: true,
            location: true, locationHours: true, asBuilt: true, asBuiltHours: true,
            bim: true, deadline: true, comment: true,
            attachments: { select: { fileKey: true, fileName: true, mimeType: true, sizeBytes: true } },
          },
        },
      },
    });

    this.logger.log(`createRevisionFromClientReject: start — original=${originalTask.id} opNo=${opNo} designType=${designType} projectId=${originalTask.projectId}`);

    // Resolve next Rn outside the interactive tx (light read). Writes below stay write-only
    // with batched attachment inserts so many files don't blow the default 5s timeout (P2028).
    const nextRevision = await this.resolveNextRevisionCode(this.prisma, {
      projectId: originalTask.projectId,
      opNo,
      designType,
    });
    this.logger.log(`createRevisionFromClientReject: nextRevision=${nextRevision}`);

    const newTaskNo = this.buildTaskNo(opNo);
    let newTitle: string | null = originalTask.title || null;
    if (designType === 'PROJECT') {
      newTitle = [opNo, originalTask.signType, originalTask.disciplineType, nextRevision]
        .filter(Boolean).join(' - ') || originalTask.title || null;
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        this.logger.log(`createRevisionFromClientReject: creating task taskNo=${newTaskNo} title=${newTitle}`);
        const newTask = await tx.task.create({
          data: {
            taskNo: newTaskNo,
            opNo: opNo || null,
            title: newTitle,
            revisionCode: nextRevision,
            designType,
            signType: originalTask.signType,
            signFamily: originalTask.signFamily,
            disciplineType: originalTask.disciplineType,
            phase: originalFull?.phase ?? null,
            description: originalTask.description,
            status: 'DESIGN_NEW',
            priority: originalTask.priority,
            projectId: originalTask.projectId,
            assigneeId: null,
            dueDate: originalTask.dueDate,
            technicalHead: originalTask.technicalHead,
            teamLead: originalTask.teamLead,
            subTeamLead: originalTask.subTeamLead,
            designers: originalTask.designers,
          },
          select: { id: true, taskNo: true },
        });

        this.logger.log(`createRevisionFromClientReject: task created id=${newTask.id} taskNo=${newTask.taskNo} revision=${nextRevision}`);

        if (originalFull?.retailDetails && originalFull.retailDetails.length > 0) {
          for (const detail of originalFull.retailDetails) {
            const newDetail = await tx.retailTaskDetail.create({
              data: {
                taskId: newTask.id,
                providedFile: detail.providedFile,
                fileKey: detail.fileKey,
                fileUrl: detail.fileUrl,
                hodName: detail.hodName,
                designTypes: detail.designTypes,
                hoursRequired: detail.hoursRequired,
                comment: detail.comment,
                signFamily: detail.signFamily,
                signType: detail.signType,
                planCode: detail.planCode,
                contractRef: detail.contractRef,
                quantity: detail.quantity,
                deadline: detail.deadline,
              },
              select: { id: true },
            });
            if (detail.attachments.length > 0) {
              await tx.retailTaskDetailAttachment.createMany({
                data: detail.attachments.map((att) => ({
                  retailTaskDetailId: newDetail.id,
                  fileKey: att.fileKey,
                  fileName: att.fileName,
                  mimeType: att.mimeType,
                  sizeBytes: att.sizeBytes,
                })),
              });
            }
          }
        }

        if (originalFull?.projectDetails && originalFull.projectDetails.length > 0) {
          for (const detail of originalFull.projectDetails) {
            const newDetail = await tx.projectTaskDetail.create({
              data: {
                taskId: newTask.id,
                signType: detail.signType,
                planCode: detail.planCode,
                area: detail.area,
                level: detail.level,
                artwork: detail.artwork,
                artworkHours: detail.artworkHours,
                technical: detail.technical,
                technicalHours: detail.technicalHours,
                location: detail.location,
                locationHours: detail.locationHours,
                asBuilt: detail.asBuilt,
                asBuiltHours: detail.asBuiltHours,
                bim: detail.bim,
                deadline: detail.deadline,
                comment: detail.comment,
              },
              select: { id: true },
            });
            if (detail.attachments.length > 0) {
              await tx.projectTaskDetailAttachment.createMany({
                data: detail.attachments.map((att) => ({
                  projectTaskDetailId: newDetail.id,
                  fileKey: att.fileKey,
                  fileName: att.fileName,
                  mimeType: att.mimeType,
                  sizeBytes: att.sizeBytes,
                })),
              });
            }
          }
        }

        return { id: newTask.id, taskNo: newTask.taskNo, _revision: nextRevision };
      },
      { timeout: 30_000 },
    );

    // Everything below uses this.prisma — must be outside the transaction to avoid P2028.

    // Reject context fields on the new revision task
    await (this.prisma.task.update as any)({
      where: { id: result.id },
      data: {
        reworkNote: dto.reworkNote?.trim() || null,
        reworkAttachmentUrl: this.toStoredS3ObjectKey(dto.reworkAttachmentUrl),
        reworkAttachmentName: dto.reworkAttachmentName || null,
        reworkLinkUrl: dto.reworkLinkUrl || null,
        reworkLinkName: dto.reworkLinkName || null,
        previousRevisionTaskId: originalTask.id,
      },
    }).catch((err: unknown) => {
      this.logger.warn('Client-reject revision context fields not saved:', err);
    });

    // Chatter post with rejection instructions on the new revision
    const note = dto.reworkNote?.trim();
    if (note) {
      await this.prisma.chatterPost.create({
        data: {
          taskId: result.id,
          title: 'Client Reject Instructions',
          message: `Client Rejected — next revision:\n${note}`,
          postType: 'CLIENT_REJECT',
          authorId: userId,
        },
      }).catch((err) => this.logger.error('Failed to create client-reject chatter post', err));
    }

    // Activity log
    await this.activityLogger.log({
      action: ActivityAction.TASK_CREATED,
      userId,
      taskId: result.id,
      details: {
        event: ActivityAction.TASK_CREATED,
        messageKey: 'task_created',
        taskSnapshot: { id: result.id, taskNo: result.taskNo },
        context: { source: 'client_reject_revision', previousTaskId: originalTask.id, revisionCode: result._revision },
      },
    }).catch((err) => this.logger.error('Failed to log client-reject revision activity', err));

    // Notify HOD / Admin / matched sales once (not every salesperson)
    const revisionProject = await this.prisma.project.findUnique({
      where: { id: originalTask.projectId },
      select: { salesPerson: true, createdById: true },
    });
    const stakeholders = await this.resolveHodAdminAndSalesNotifyIds(revisionProject, {
      taskId: result.id,
    });
    const taskLink = taskViewPath(result.id, designType);
    for (const stakeholderId of stakeholders) {
      this.notificationsService
        .create({
          userId: stakeholderId,
          title: `New Revision Created — ${result.taskNo}`,
          message: `Revision ${result._revision} created after client reject. Awaiting assignment.`,
          linkUrl: taskLink,
        })
        .catch((err) => this.logger.error('Failed to send new revision notification', err));
      this.dashboardRealtime?.notifyUserNotificationRefresh(stakeholderId);
    }

    return { id: result.id, taskNo: result.taskNo };
  }

  /** Dashboard: task counts per status for a given set of users */
  async getStatusSummary(userId: string, role: UserRole) {
    const where: Record<string, unknown> = {};

    if (role === UserRole.DESIGNER) {
      const junctionTaskIds = await this.prisma.taskDesigner.findMany({
        where: { designerId: userId },
        select: { taskId: true },
      });
      const splitIds = junctionTaskIds.map((r) => r.taskId);
      where.OR = [{ assigneeId: userId }, ...(splitIds.length > 0 ? [{ id: { in: splitIds } }] : [])];
    }

    const tasks = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    return tasks.reduce(
      (acc, row) => {
        acc[toApiTaskStatus(row.status)] = row._count.status;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  async remove(id: string) {
    if (!this.isUuid(id)) {
      throw new BadRequestException('Invalid task id');
    }
    const existing = await this.prisma.task.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Task not found');
    return this.prisma.task.delete({ where: { id } });
  }

  async submitWork(
    taskId: string,
    userId: string,
    dto: SubmitWorkDto,
    files: Express.Multer.File[],
  ) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const task = await this.prisma.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
    if (!task) throw new NotFoundException('Task not found');

    // Upload files in parallel (sequential uploads were the main submit delay).
    const fileList = files ?? [];
    const uploadedFiles = await Promise.all(
      fileList.map(async (file) => {
        const result = await this.taskFilesService.uploadTaskFile(file, userId);
        return {
          fileKey: result.key,
          fileName: result.fileName,
          mimeType: result.mimeType,
          sizeBytes: result.size,
        };
      }),
    );

    // Create/promote work session + files in a transaction, then update task status
    const session = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.taskWorkSession.findFirst({
        where: { taskId, designerId: userId, status: { in: ['Draft', 'HandedOff'] } },
        orderBy: { createdAt: 'desc' },
      });

      const clientSeconds = normalizeWorkSeconds(dto.durationSeconds);
      let serverSeconds = 0;
      if (draft) {
        serverSeconds =
          draft.status === 'Draft'
            ? effectiveWorkSessionSeconds(draft.durationSeconds, draft.runStartedAt)
            : normalizeWorkSeconds(draft.durationSeconds);
      }
      // Never let a stale tab under-write server-known elapsed time.
      const durationSeconds = Math.max(clientSeconds, serverSeconds);

      let session;
      if (draft) {
        session = await tx.taskWorkSession.update({
          where: { id: draft.id },
          data: {
            durationSeconds,
            submissionLink: dto.submissionLink?.trim() || null,
            pauseLog: dto.pauseLog || draft.pauseLog || null,
            runStartedAt: null,
            status: 'Submitted',
            submittedAt: new Date(),
          },
        });
      } else {
        session = await tx.taskWorkSession.create({
          data: {
            taskId,
            designerId: userId,
            durationSeconds,
            submissionLink: dto.submissionLink?.trim() || null,
            pauseLog: dto.pauseLog || null,
            status: 'Submitted',
          },
        });
      }

      if (uploadedFiles.length > 0) {
        await tx.taskWorkSessionFile.createMany({
          data: uploadedFiles.map((f) => ({
            sessionId: session.id,
            fileKey: f.fileKey,
            fileName: f.fileName,
            mimeType: f.mimeType || null,
            sizeBytes: BigInt(f.sizeBytes),
          })),
        });
      }

      await tx.task.update({
        where: { id: taskId },
        data: {
          status: 'DESIGN_COMPLETED',
          completedAt: new Date(),
          ...(task.startedAt ? {} : { startedAt: new Date() }),
        },
      });

      return session;
    }, { timeout: 15_000 });

    // Realtime first so other tabs update as soon as the DB commit succeeds.
    this.dashboardRealtime?.notifyTimerUpdated(userId, {
      taskId,
      accumulatedSeconds: 0,
      runStartedAt: null,
      taskStatus: 'DESIGN_COMPLETED',
      handedOff: false,
      locked: false,
      sessionClosed: true,
    });
    this.dashboardRealtime?.notifyOverviewRefresh('task_completed', {
      taskId,
      status: 'DESIGN_COMPLETED',
      changedTaskIds: [taskId],
      updatedBy: userId,
    });

    // Activity + HOD inbox are important but must not block the HTTP response.
    void this.runSubmitWorkSideEffects({
      task,
      taskId,
      userId,
      sessionId: session.id,
      durationSeconds: session.durationSeconds,
      fileCount: uploadedFiles.length,
      hasLink: !!dto.submissionLink,
    }).catch((err) => this.logger.error('submitWork side effects failed', err));

    return { sessionId: session.id, fileCount: uploadedFiles.length };
  }

  private async runSubmitWorkSideEffects(params: {
    task: any;
    taskId: string;
    userId: string;
    sessionId: string;
    durationSeconds: number;
    fileCount: number;
    hasLink: boolean;
  }) {
    const { task, taskId, userId, sessionId, durationSeconds, fileCount, hasLink } = params;
    const previousStatusApi = toApiTaskStatus(task.status);
    const submittedTaskSnapshot = {
      id: task.id,
      taskNo: task.taskNo,
      opNo: task.opNo,
      title: task.title ?? undefined,
      status: 'DESIGN_COMPLETED',
    };
    const submittedProjectSnapshot = {
      id: task.project?.id,
      projectNo: task.project?.projectNo,
      name: task.project?.name,
    };

    await Promise.all([
      this.activityLogger.log({
        action: ActivityAction.TASK_WORK_SUBMITTED,
        userId,
        taskId,
        details: {
          event: ActivityAction.TASK_WORK_SUBMITTED,
          messageKey: 'task_work_submitted',
          taskSnapshot: submittedTaskSnapshot,
          projectSnapshot: submittedProjectSnapshot,
          changes: {
            durationSeconds,
            fileCount,
            hasLink,
          },
          context: { sessionId, source: 'tasks.submitWork' },
        },
      }),
      !COMPLETED_STATUS_FILTER.includes(previousStatusApi)
        ? this.activityLogger.log({
            action: ActivityAction.TASK_COMPLETED,
            userId,
            taskId,
            details: {
              event: ActivityAction.TASK_COMPLETED,
              messageKey: 'task_completed',
              taskSnapshot: submittedTaskSnapshot,
              projectSnapshot: submittedProjectSnapshot,
              changes: {
                oldStatus: previousStatusApi,
                newStatus: 'DESIGN_COMPLETED',
              },
              context: { sessionId, source: 'tasks.submitWork' },
            },
          })
        : Promise.resolve(),
    ]);

    try {
      const submittedTask = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: {
          taskNo: true,
          designType: true,
          project: { select: { name: true } },
          assignee: { select: { fullName: true } },
          taskDesigners: { select: { designer: { select: { fullName: true } } } },
        },
      });
      if (!submittedTask) return;

      const taskLink = taskViewPath(taskId, submittedTask.designType);
      const submitterName =
        submittedTask.assignee?.fullName ??
        ((submittedTask as any).taskDesigners?.length > 0
          ? (submittedTask as any).taskDesigners.map((d: any) => d.designer.fullName).join(', ')
          : 'Designer');
      const submitMsg = `${submittedTask.taskNo} — ${submittedTask.project?.name ?? 'Unknown Project'} work submitted by ${submitterName}. Ready for review.`;
      const hodUsers = await this.prisma.user.findMany({
        where: { role: { name: { in: ['HOD', 'ADMIN'] } } },
        select: { id: true },
      });
      await Promise.all(
        hodUsers.map((hod) =>
          this.notificationsService
            .create({
              userId: hod.id,
              title: `Work Submitted — ${submittedTask.taskNo}`,
              message: submitMsg,
              linkUrl: taskLink,
            })
            .then(() => this.dashboardRealtime?.notifyUserNotificationRefresh(hod.id))
            .catch((err) => this.logger.error('Failed to send work-submitted notification', err)),
        ),
      );
    } catch (err) {
      this.logger.error('Failed to send work-submitted notifications to HOD', err);
    }
  }

  async getSubmittedSession(taskId: string) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const session = await this.prisma.taskWorkSession.findFirst({
      where: { taskId, status: 'Submitted' },
      orderBy: { submittedAt: 'desc' },
      include: {
        files: true,
        designer: { select: { fullName: true } },
      },
    });
    if (!session) return null;
    return {
      durationSeconds: session.durationSeconds,
      submittedAt: session.submittedAt,
      submissionLink: session.submissionLink,
      submittedBy: session.designer?.fullName ?? null,
      files: await Promise.all(session.files.map(async (f) => ({
        fileName: f.fileName,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes == null ? null : Number(f.sizeBytes),
        fileUrl: f.fileKey ? await this.taskFilesService.createSignedReadUrl(f.fileKey) : null,
      }))),
    };
  }

  async getRunningTimerForDesigner(designerId: string) {
    if (!this.isUuid(designerId)) throw new BadRequestException('Invalid designer id');
    const drafts = await this.prisma.taskWorkSession.findMany({
      where: {
        designerId,
        status: 'Draft',
        runStartedAt: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, taskId: true, runStartedAt: true },
    });
    if (drafts.length === 0) return null;

    const canonical = drafts[0];
    if (drafts.length > 1) {
      await this.prisma.taskWorkSession.updateMany({
        where: {
          designerId,
          status: 'Draft',
          runStartedAt: { not: null },
          NOT: { id: canonical.id },
        },
        data: { runStartedAt: null },
      });
    }

    return {
      taskId: canonical.taskId,
      runStartedAt: canonical.runStartedAt!.toISOString(),
    };
  }

  async getTimerState(taskId: string, userId: string) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const draft = await this.prisma.taskWorkSession.findFirst({
      where: { taskId, designerId: userId, status: { in: ['Draft', 'HandedOff'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!draft) return null;
    const handedOff = draft.status === 'HandedOff';
    let runStartedAt: string | null = handedOff ? null : (draft.runStartedAt?.toISOString() ?? null);

    if (runStartedAt) {
      const active = await this.getRunningTimerForDesigner(userId);
      if (!active || active.taskId !== taskId) {
        runStartedAt = null;
        if (draft.runStartedAt && draft.status === 'Draft') {
          await this.prisma.taskWorkSession.update({
            where: { id: draft.id },
            data: { runStartedAt: null },
          });
        }
      }
    }

    return {
      accumulatedSeconds: draft.durationSeconds,
      pauseLog: draft.pauseLog ?? null,
      runStartedAt,
      locked: handedOff,
      handedOff,
    };
  }

  private resolveRunStartedAtFromDto(dto: SaveTimerStateDto): Date | null | undefined {
    if (!('runStartedAt' in dto)) return undefined;
    // Start intent: stamp server time so all devices share one clock (ignore client skew).
    if (dto.runStartedAt != null && dto.runStartedAt !== '') {
      return new Date();
    }
    return null;
  }

  private buildTimerStatePayload(
    taskId: string,
    row: {
      id: string;
      durationSeconds: number;
      pauseLog: string | null;
      runStartedAt: Date | null;
      status?: string;
    } | null,
    extras: { handedOff?: boolean; locked?: boolean; sessionClosed?: boolean } = {},
  ) {
    const handedOff = extras.handedOff ?? row?.status === 'HandedOff';
    const locked = extras.locked ?? handedOff;
    return {
      sessionId: row?.id ?? null,
      accumulatedSeconds: row?.durationSeconds ?? 0,
      pauseLog: row?.pauseLog ?? null,
      runStartedAt: handedOff || locked ? null : (row?.runStartedAt?.toISOString() ?? null),
      locked,
      handedOff,
      ...(extras.sessionClosed !== undefined ? { sessionClosed: extras.sessionClosed } : {}),
    };
  }

  async saveTimerState(taskId: string, userId: string, dto: SaveTimerStateDto) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('Task not found');

    const runStartedAt = this.resolveRunStartedAtFromDto(dto);

    const saved = await this.prisma.$transaction(async (tx) => {
      const handedOff = await tx.taskWorkSession.findFirst({
        where: { taskId, designerId: userId, status: 'HandedOff' },
      });
      if (handedOff) {
        throw new ForbiddenException(
          'Your work on this task was handed off to another designer — the timer is closed for your slice.',
        );
      }

      if (runStartedAt) {
        const otherRunning = await tx.taskWorkSession.findFirst({
          where: {
            designerId: userId,
            status: 'Draft',
            runStartedAt: { not: null },
            NOT: { taskId },
          },
          orderBy: { createdAt: 'desc' },
          select: { taskId: true },
        });
        if (otherRunning) {
          throw new ForbiddenException(
            'Pause or complete the task that is currently running before starting another.',
          );
        }
      }

      const existing = await tx.taskWorkSession.findFirst({
        where: { taskId, designerId: userId, status: 'Draft' },
        orderBy: { createdAt: 'desc' },
      });

      // Pause: fold live elapsed on the server, then clear runStartedAt on all drafts.
      if (runStartedAt === null && 'runStartedAt' in dto) {
        let durationSeconds = dto.accumulatedSeconds;
        if (existing?.runStartedAt) {
          durationSeconds = effectiveWorkSessionSeconds(
            existing.durationSeconds,
            existing.runStartedAt,
          );
        } else if (existing) {
          durationSeconds = Math.max(existing.durationSeconds, dto.accumulatedSeconds);
        }

        await tx.taskWorkSession.updateMany({
          where: { taskId, designerId: userId, status: 'Draft' },
          data: {
            runStartedAt: null,
            durationSeconds,
            ...(dto.pauseLog !== undefined ? { pauseLog: dto.pauseLog } : {}),
          },
        });
        const latest = await tx.taskWorkSession.findFirst({
          where: { taskId, designerId: userId, status: 'Draft' },
          orderBy: { createdAt: 'desc' },
        });
        return latest;
      }

      if (existing) {
        // Start/resume (and any non-pause sync): never let a stale tab regress banked time.
        // If a run is already live, fold it into the bank first so that elapsed is not dropped
        // when we stamp a fresh server runStartedAt.
        const serverBanked = existing.runStartedAt
          ? effectiveWorkSessionSeconds(existing.durationSeconds, existing.runStartedAt)
          : normalizeWorkSeconds(existing.durationSeconds);
        const durationSeconds = Math.max(
          normalizeWorkSeconds(dto.accumulatedSeconds),
          serverBanked,
        );

        await tx.taskWorkSession.update({
          where: { id: existing.id },
          data: {
            durationSeconds,
            pauseLog: dto.pauseLog ?? existing.pauseLog,
            ...(runStartedAt !== undefined ? { runStartedAt } : {}),
          },
        });
        return tx.taskWorkSession.findUnique({ where: { id: existing.id } });
      }

      return tx.taskWorkSession.create({
        data: {
          taskId,
          designerId: userId,
          durationSeconds: normalizeWorkSeconds(dto.accumulatedSeconds),
          pauseLog: dto.pauseLog ?? null,
          runStartedAt: runStartedAt ?? null,
          status: 'Draft',
        },
      });
    }, { timeout: 15_000 });

    const state = this.buildTimerStatePayload(taskId, saved);
    this.dashboardRealtime?.notifyTimerUpdated(userId, {
      taskId,
      accumulatedSeconds: state.accumulatedSeconds,
      runStartedAt: state.runStartedAt,
      handedOff: state.handedOff,
      locked: state.locked,
    });
    return state;
  }

  async freezeDraftWorkSession(taskId: string, designerId: string, closeSession = true) {
    if (!this.isUuid(taskId)) throw new BadRequestException('Invalid task id');
    if (!this.isUuid(designerId)) throw new BadRequestException('Invalid designer id');

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, taskNo: true, designType: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const draft = await this.prisma.taskWorkSession.findFirst({
      where: { taskId, designerId, status: 'Draft' },
      orderBy: { createdAt: 'desc' },
    });

    const handedOff = await this.prisma.taskWorkSession.findMany({
      where: { taskId, designerId, status: 'HandedOff' },
      select: { durationSeconds: true },
    });
    const handedOffSeconds = handedOff.reduce((sum, row) => sum + row.durationSeconds, 0);

    if (!draft) {
      const totalSeconds = normalizeWorkSeconds(handedOffSeconds);
      return {
        workedSeconds: totalSeconds,
        workedHours: workedHoursFromSeconds(totalSeconds),
        frozen: false,
        hadRunningTimer: false,
        sessionClosed: false,
      };
    }

    const effectiveSeconds = effectiveWorkSessionSeconds(draft.durationSeconds, draft.runStartedAt);
    const totalEffective = handedOffSeconds + effectiveSeconds;
    const frozenSeconds = normalizeWorkSeconds(totalEffective);
    const draftFrozenOnly = normalizeWorkSeconds(effectiveSeconds);
    const hadRunningTimer = draft.runStartedAt != null;

    if (closeSession) {
      await this.prisma.taskWorkSession.update({
        where: { id: draft.id },
        data: {
          durationSeconds: draftFrozenOnly,
          runStartedAt: null,
          status: 'HandedOff',
        },
      });
    } else if (hadRunningTimer || draftFrozenOnly !== draft.durationSeconds) {
      await this.prisma.taskWorkSession.update({
        where: { id: draft.id },
        data: {
          durationSeconds: draftFrozenOnly,
          runStartedAt: null,
        },
      });
    }

    // Always push a realtime pause so an open browser tab stops ticking immediately.
    // Inbox notice stays on the "other slices remain" path (designer can press Start again).
    if (hadRunningTimer) {
      this.dashboardRealtime?.notifyTimerPaused(designerId, taskId, closeSession);
      this.dashboardRealtime?.notifyTimerUpdated(designerId, {
        taskId,
        accumulatedSeconds: draftFrozenOnly,
        runStartedAt: null,
        handedOff: closeSession,
        locked: closeSession,
        sessionClosed: closeSession,
      });
      if (!closeSession) {
        const linkUrl =
          taskViewPath(taskId, task.designType);
        this.notificationsService
          .create({
            userId: designerId,
            title: `Timer Paused — ${task.taskNo}`,
            message: `Your running timer was paused because a slice of this task was reassigned. Press Start to resume tracking your remaining time.`,
            linkUrl,
          })
          .catch((err) => this.logger.error('Failed to send timer-paused notification to designer', err));
        this.dashboardRealtime?.notifyUserNotificationRefresh(designerId);
      }
    }

    return {
      workedSeconds: frozenSeconds,
      workedHours: workedHoursFromSeconds(frozenSeconds),
      frozen: frozenSeconds > 0 || hadRunningTimer,
      hadRunningTimer,
      sessionClosed: closeSession,
    };
  }

  private async getAssignedProjectIdsForQsUser(userId: string) {
    const rows = await this.prisma.$queryRaw<Array<{ projectId: string }>>(Prisma.sql`
      SELECT [projectId] AS [projectId]
      FROM [ErpTSProjectQsAssignment]
      WHERE [qsUserId] = ${userId}
    `);
    return rows.map((row) => row.projectId);
  }

  private async assignProjectToQsTeam(
    projectId: string,
    actingUserId: string | null,
    project: { name: string; projectNo?: string | null },
  ) {
    const qsUsers = await this.prisma.user.findMany({
      where: { role: { name: UserRole.QS } },
      select: { id: true },
    });
    if (qsUsers.length === 0) return;

    const assignedCount = await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO [ErpTSProjectQsAssignment] ([projectId], [qsUserId])
      SELECT ${projectId}, [incoming].[qsUserId]
      FROM (VALUES ${Prisma.join(qsUsers.map((user) => Prisma.sql`(${user.id})`))}) AS [incoming]([qsUserId])
      WHERE NOT EXISTS (
        SELECT 1
        FROM [ErpTSProjectQsAssignment] [existing]
        WHERE [existing].[projectId] = ${projectId}
          AND [existing].[qsUserId] = [incoming].[qsUserId]
      )
    `);
    if (assignedCount === 0) return;

    const linkUrl = `/project-task-view/${projectId}`;
    const message = `${project.projectNo ? `${project.projectNo} — ` : ''}${project.name} has been assigned to QS for Sign Family review.`;
    for (const qsUser of qsUsers) {
      this.notificationsService
        .create({
          userId: qsUser.id,
          title: 'New Project Assigned to QS',
          message,
          linkUrl,
        })
        .catch((err) => this.logger.error('Failed to send QS-assignment notification', err));
      this.dashboardRealtime?.notifyUserNotificationRefresh(qsUser.id);
    }

    if (actingUserId) {
      await this.activityLogger.log({
        action: ActivityAction.QS_PROJECT_ASSIGNED,
        userId: actingUserId,
        details: {
          event: ActivityAction.QS_PROJECT_ASSIGNED,
          messageKey: 'qs_project_assigned',
          projectSnapshot: {
            id: projectId,
            projectNo: project.projectNo ?? null,
            name: project.name,
          },
          context: {
            assignedUserIds: qsUsers.map((user) => user.id),
            source: 'tasks.assignProjectToQsTeam',
          },
        },
      });
    }
  }

  private async assertQsTaskAccess(taskId: string, userId?: string, role?: UserRole) {
    if (role !== UserRole.QS) return;
    if (!userId) throw new ForbiddenException('QS access requires an authenticated user');
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT TOP 1 [assignment].[id] AS [id]
      FROM [ErpTSProjectQsAssignment] [assignment]
      INNER JOIN [ErpTSTask] [task] ON [task].[projectId] = [assignment].[projectId]
      WHERE [task].[id] = ${taskId}
        AND [assignment].[qsUserId] = ${userId}
    `);
    if (rows.length === 0) {
      throw new ForbiddenException('QS users can only access tasks for assigned projects');
    }
  }
}
