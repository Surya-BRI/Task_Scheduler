'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DesignListKanbanPage } from '@/views/DesignListKanbanPage';

export default function DesignListKanbanRoutePage() {
  return (
    <ProtectedRoute>
      <DesignListKanbanPage />
    </ProtectedRoute>
  );
}
