export const ActivityAction = {
  TASK_CREATED: 'TASK_CREATED',
  ASSIGNED_TASK: 'ASSIGNED_TASK',
  STATUS_CHANGED: 'STATUS_CHANGED',
  SCHEDULER_WEEK_SAVED: 'SCHEDULER_WEEK_SAVED',
  SCHEDULER_WEEK_LOCKED: 'SCHEDULER_WEEK_LOCKED',
  SCHEDULER_WEEK_UNLOCKED: 'SCHEDULER_WEEK_UNLOCKED',
  PROJECT_FILE_UPLOADED: 'PROJECT_FILE_UPLOADED',
  PROJECT_FILE_DELETED: 'PROJECT_FILE_DELETED',
  TASK_FILE_UPLOADED: 'TASK_FILE_UPLOADED',
  CREATED_CHATTER_POST: 'CREATED_CHATTER_POST',
  CREATED_CHATTER_COMMENT: 'CREATED_CHATTER_COMMENT',
  TASK_WORK_SUBMITTED: 'TASK_WORK_SUBMITTED',
  // Leave requests
  LEAVE_REQUEST_SUBMITTED: 'LEAVE_REQUEST_SUBMITTED',
  LEAVE_REQUEST_STATUS_CHANGED: 'LEAVE_REQUEST_STATUS_CHANGED',
  // Regularization requests
  REGULARIZATION_SUBMITTED: 'REGULARIZATION_SUBMITTED',
  REGULARIZATION_STATUS_CHANGED: 'REGULARIZATION_STATUS_CHANGED',
  // Overtime requests
  OVERTIME_REQUEST_SUBMITTED: 'OVERTIME_REQUEST_SUBMITTED',
  OVERTIME_REQUEST_STATUS_CHANGED: 'OVERTIME_REQUEST_STATUS_CHANGED',
} as const;

export type ActivityActionType = (typeof ActivityAction)[keyof typeof ActivityAction];

export type ActivityDetailsPayload = {
  event: string;
  messageKey: string;
  taskSnapshot?: {
    id?: string;
    taskNo?: string;
    opNo?: string | null;
    title?: string;
    status?: string | null;
  };
  projectSnapshot?: {
    id?: string;
    projectNo?: string | null;
    name?: string;
  };
  changes?: Record<string, unknown>;
  fileMeta?: {
    id?: string;
    fileName?: string;
    fileKey?: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
  };
  context?: Record<string, unknown>;
};
