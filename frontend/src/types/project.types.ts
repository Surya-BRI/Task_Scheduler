export interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  /** Parsed from ISO string by the API client's date reviver */
  createdAt: Date;
}

