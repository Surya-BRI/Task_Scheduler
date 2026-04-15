'use client';

import { useEffect, useState } from 'react';
import { listTasks } from '@/features/tasks/services/tasks.api';
import type { TaskItem } from '@/types/task.types';

export function useTasks() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listTasks()
      .then(setTasks)
      .finally(() => setLoading(false));
  }, []);

  return { tasks, loading };
}
