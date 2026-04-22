'use client';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DesignListRecordPage } from '@/views/DesignListRecordPage';

export default function DesignListRecordRoutePage() {
  return (
    <ProtectedRoute>
      <DesignListRecordPage />
    </ProtectedRoute>
  );
}

