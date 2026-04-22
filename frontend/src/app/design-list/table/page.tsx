'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DesignListTablePage } from '@/views/DesignListTablePage';

export default function DesignListTableRoutePage() {
  return (
    <ProtectedRoute>
      <DesignListTablePage />
    </ProtectedRoute>
  );
}
