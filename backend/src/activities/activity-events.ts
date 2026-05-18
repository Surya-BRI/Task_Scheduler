export const ActivityAction = {
  TASK_CREATED: 'TASK_CREATED',
  ASSIGNED_TASK: 'ASSIGNED_TASK',
  STATUS_CHANGED: 'STATUS_CHANGED',
  PROJECT_FILE_UPLOADED: 'PROJECT_FILE_UPLOADED',
  PROJECT_FILE_DELETED: 'PROJECT_FILE_DELETED',
  TASK_FILE_UPLOADED: 'TASK_FILE_UPLOADED',
  CREATED_CHATTER_POST: 'CREATED_CHATTER_POST',
  CREATED_CHATTER_COMMENT: 'CREATED_CHATTER_COMMENT',
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
