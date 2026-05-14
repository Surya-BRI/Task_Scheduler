export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'ON_HOLD';
export type ProjectCategory = 'Retail' | 'Project';

export interface ProjectItem {
  id: string;
  projectNo?: string | null;
  name: string;
  category: ProjectCategory;
  businessUnit?: string | null;
  description?: string | null;
  status: ProjectStatus;
  salesPerson?: string | null;
  createdById?: string | null;
  createdBy?: { id: string; fullName: string } | null;
  _count?: { tasks: number };
  /** Parsed from ISO string by the API client's date reviver */
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectDetail extends ProjectItem {
  tasks: Array<{
    id: string;
    opNo?: string | null;
    title: string;
    status: string;
    priority: string;
    dueDate?: Date | null;
    assignee?: { id: string; fullName: string } | null;
  }>;
}

export interface ProjectListResponse {
  data: ProjectItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
