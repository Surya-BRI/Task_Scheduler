export type TaskStatus = 'PENDING' | 'WIP' | 'COMPLETED' | 'REVISION' | 'APPROVED';
export type TaskPriority = 'High' | 'Medium' | 'Low';

export interface TaskItem {
  id: string;
  opNo?: string | null;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  project?: { id: string; name: string; projectNo?: string | null; category: string };
  assigneeId?: string | null;
  assignee?: { id: string; fullName: string; email: string } | null;
  /** Parsed from ISO string by the API client's date reviver */
  dueDate?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  /** Parsed from ISO string by the API client's date reviver */
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskListResponse {
  data: TaskItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type TaskStatusSummary = Partial<Record<TaskStatus, number>>;
