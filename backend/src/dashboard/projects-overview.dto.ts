export interface ScheduledTaskItem {
  taskNo: string;
  title: string;
  designType: string | null;
  revisionCode: string | null;
  assigneeName: string;
  assigneeInitials: string;
  dueDate: string | null;
}

export interface CompletedTaskItem {
  taskNo: string;
  title: string;
  designType: string | null;
  revisionCode: string | null;
  completedAt: string | null;
}

export interface OnHoldTaskItem {
  taskNo: string;
  title: string;
  designType: string | null;
  revisionCode: string | null;
  holdDate: string | null;
  reason: string | null;
}

export interface ReallocatedTaskItem {
  taskNo: string;
  title: string;
  designType: string | null;
  revisionCode: string | null;
  fromAssigneeName: string | null;
  newAssigneeName: string;
  reassignedAt: string;
}

export interface InboxItem {
  id: string;
  summary: string;
  occurredAt: string;
  taskNo: string | null;
  requestType?: 'regularization' | 'overtime' | 'activity';
  linkUrl?: string | null;
  requiresAction?: boolean;
  requesterName?: string | null;
  status?: string | null;
}

export interface DonutSegment {
  value: number;
  pct: number;
  color: string;
}

export interface ProjectsOverviewResponseDto {
  weekStart: string;
  scheduledTasks: ScheduledTaskItem[];
  completedTasks: CompletedTaskItem[];
  onHoldTasks: OnHoldTaskItem[];
  reallocatedTasks: ReallocatedTaskItem[];
  inbox: InboxItem[];
  summary: {
    total: number;
    active: number;
    onHold: number;
    completed: number;
    onTimePct: number;
    reallocatedPct: number;
    donut: {
      active: DonutSegment;
      onHold: DonutSegment;
      completed: DonutSegment;
      centerPct: number;
      centerTotal: number;
    };
  };
}
