'use client';

import { useEffect, useState } from 'react';
import { listProjects } from '@/features/projects/services/projects.api';
import type { ProjectItem } from '@/types/project.types';

export function useProjects() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
  }, []);

  return { projects, loading };
}
