import { Prisma } from '@prisma/client';
import { COMPLETED_STATUS_FILTER } from '../dashboard/task-status-buckets.util';
import { toApiTaskStatus } from './task-status.util';

/** Slim task payload shared by scheduler queue + week-assignment embeds. */
export const SCHEDULER_TASK_SUMMARY_SELECT = {
  id: true,
  opNo: true,
  title: true,
  signType: true,
  revisionCode: true,
  designType: true,
  disciplineType: true,
  status: true,
  priority: true,
  assigneeId: true,
  holdPreviousStatus: true,
  projectId: true,
  updatedAt: true,
  project: {
    select: {
      id: true,
      name: true,
      projectNo: true,
      category: true,
      technicalHead: true,
      teamLead: true,
      subTeamLead: true,
      designers: true,
    },
  },
  taskDesigners: { select: { designerId: true } },
  retailDetails: { select: { hoursRequired: true } },
  projectDetails: {
    select: {
      artworkHours: true,
      technicalHours: true,
      locationHours: true,
      asBuiltHours: true,
    },
  },
} satisfies Prisma.TaskSelect;

export type SchedulerTaskSummaryRow = Prisma.TaskGetPayload<{
  select: typeof SCHEDULER_TASK_SUMMARY_SELECT;
}>;

export type SchedulerTaskSummaryDto = {
  id: string;
  opNo: string | null;
  title: string | null;
  signType: string | null;
  revisionCode: string | null;
  designType: string | null;
  disciplineType: string | null;
  status: string;
  priority: string | null;
  assigneeId: string | null;
  holdPreviousStatus: string | null;
  projectId: string | null;
  updatedAt: string;
  estimatedHours: number;
  hasTaskDesigners: boolean;
  project: {
    id: string;
    name: string | null;
    projectNo: string | null;
    category: string | null;
    technicalHead: string | null;
    teamLead: string | null;
    subTeamLead: string | null;
    designers: string | null;
  } | null;
};

function mapStatusForApi(status?: string | null): string {
  return toApiTaskStatus(status);
}

export function computeSchedulerEstimatedHours(task: SchedulerTaskSummaryRow): number {
  const retailHours = task.retailDetails?.[0]?.hoursRequired;
  const projectHours = (task.projectDetails ?? []).reduce(
    (sum, detail) =>
      sum +
      (Number(detail.artworkHours) || 0) +
      (Number(detail.technicalHours) || 0) +
      (Number(detail.locationHours) || 0) +
      (Number(detail.asBuiltHours) || 0),
    0,
  );
  return Math.max(1, Number(retailHours ?? (projectHours || null) ?? 0) || 0);
}

export function mapSchedulerTaskSummary(task: SchedulerTaskSummaryRow): SchedulerTaskSummaryDto {
  const project = task.project
    ? {
        id: task.project.id,
        name: task.project.name,
        projectNo: task.project.projectNo,
        category: task.project.category,
        technicalHead: task.project.technicalHead,
        teamLead: task.project.teamLead,
        subTeamLead: task.project.subTeamLead,
        designers: task.project.designers,
      }
    : null;

  return {
    id: task.id,
    opNo: task.opNo,
    title: task.title,
    signType: task.signType,
    revisionCode: task.revisionCode,
    designType: task.designType,
    disciplineType: task.disciplineType,
    status: mapStatusForApi(task.status),
    priority: task.priority,
    assigneeId: task.assigneeId,
    holdPreviousStatus: task.holdPreviousStatus,
    projectId: task.projectId ?? project?.id ?? null,
    updatedAt: task.updatedAt.toISOString(),
    estimatedHours: computeSchedulerEstimatedHours(task),
    hasTaskDesigners: (task.taskDesigners?.length ?? 0) > 0,
    project,
  };
}

/** Prisma where-clause for sidebar backlog tasks only. */
export function schedulerQueueWhere(): Prisma.TaskWhereInput {
  return {
    AND: [
      { status: { notIn: [...COMPLETED_STATUS_FILTER] } },
      {
        OR: [
          { status: 'ON_HOLD' },
          {
            AND: [{ assigneeId: null }, { taskDesigners: { none: {} } }],
          },
        ],
      },
    ],
  };
}
