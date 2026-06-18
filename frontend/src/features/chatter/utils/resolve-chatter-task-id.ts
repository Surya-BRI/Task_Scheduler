import { apiClient } from '@/lib/api-client';

export function isChatterUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? '').trim(),
  );
}

function normalizeOpNo(value: unknown): string {
  return String(value ?? '').trim();
}

function opNoMatches(taskOpNo: unknown, needle: string): boolean {
  const hay = normalizeOpNo(taskOpNo);
  if (!hay || !needle) return false;
  return hay.toLowerCase() === needle.toLowerCase();
}

type TaskListRow = {
  id?: string;
  opNo?: string | null;
  projectId?: string | null;
};

function taskRowsFromListResponse(result: unknown): TaskListRow[] {
  if (!result || typeof result !== 'object') return [];
  const data = (result as { data?: unknown }).data;
  return Array.isArray(data) ? (data as TaskListRow[]) : [];
}

export type ChatterTaskResolveContext = {
  taskId?: string | null;
  recordId?: string | null;
  opNo?: string | null;
  projectId?: string | null;
  /** Set when the page record came from GET /tasks/:id (not a design-list project row). */
  fromTaskApi?: boolean;
};

/**
 * Resolves the ErpTSTask UUID for task-scoped chatter. Never treats a project id as a task id.
 */
export async function resolveTaskIdForChatter(
  ctx: ChatterTaskResolveContext,
): Promise<string | null> {
  const explicitTaskId = ctx.taskId && isChatterUuid(ctx.taskId) ? ctx.taskId : null;
  if (explicitTaskId) return explicitTaskId;

  if (ctx.fromTaskApi && ctx.recordId && isChatterUuid(ctx.recordId)) {
    return ctx.recordId;
  }

  const opNo = normalizeOpNo(ctx.opNo);

  if (opNo) {
    try {
      const result = await apiClient.get(`/tasks?search=${encodeURIComponent(opNo)}&limit=20`);
      const rows = taskRowsFromListResponse(result);
      const projectId = ctx.projectId && isChatterUuid(ctx.projectId) ? ctx.projectId : null;
      const exact =
        rows.find((task) => opNoMatches(task?.opNo, opNo) && (!projectId || task.projectId === projectId)) ??
        rows.find((task) => opNoMatches(task?.opNo, opNo)) ??
        null;
      if (exact?.id && isChatterUuid(exact.id)) return exact.id;
    } catch {
      // fall through to project-scoped lookup
    }
  }

  if (ctx.projectId && isChatterUuid(ctx.projectId)) {
    try {
      const result = await apiClient.get(
        `/tasks?projectId=${encodeURIComponent(ctx.projectId)}&limit=20`,
      );
      const rows = taskRowsFromListResponse(result);
      const match = opNo
        ? rows.find((task) => opNoMatches(task?.opNo, opNo)) ?? null
        : rows.length === 1
          ? rows[0]
          : null;
      if (match?.id && isChatterUuid(match.id)) return match.id;
    } catch {
      // no task linked yet
    }
  }

  return null;
}
