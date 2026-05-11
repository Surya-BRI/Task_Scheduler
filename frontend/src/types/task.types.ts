export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: 'PENDING' | 'WIP' | 'COMPLETED';
  projectId: string;
  assigneeId?: string | null;
  /** Parsed from ISO string by the API client's date reviver */
  dueDate?: Date | null;
  /** Parsed from ISO string by the API client's date reviver */
  createdAt: Date;
}

