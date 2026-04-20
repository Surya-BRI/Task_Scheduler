'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { ProjectDesignPage } from '@/views/ProjectDesignPage';

export default function ProjectDesignRoutePage() {
  return (
    <ProtectedRoute>
      <ProjectDesignPage />
    </ProtectedRoute>
  );
}
