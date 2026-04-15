export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: 'PENDING' | 'WIP' | 'COMPLETED';
  projectId: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  createdAt: string;
}
