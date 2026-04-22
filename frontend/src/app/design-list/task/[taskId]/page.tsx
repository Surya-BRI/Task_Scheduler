'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { TaskDetailsPage } from '@/views/TaskDetailsPage';

export default function TaskDetailsRoutePage() {
  return (
    <ProtectedRoute>
      <TaskDetailsPage />
    </ProtectedRoute>
  );
}
