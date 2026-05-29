'use client';
import { Suspense } from 'react';
import DesignerDashboard from '../[designerId]/DesignerDashboard';

export default function DesignerDashboardPage() {
  return (
    <Suspense>
      <DesignerDashboard />
    </Suspense>
  );
}
