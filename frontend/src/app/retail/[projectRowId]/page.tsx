'use client';

import { Suspense } from 'react';
import { RetailProjectPage } from '@/views/RetailProjectPage';

function Fallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-slate-50 text-sm text-slate-600">
      Loading…
    </div>
  );
}

export default function RetailProjectRoutePage() {
  return (
    <Suspense fallback={<Fallback />}>
      <RetailProjectPage />
    </Suspense>
  );
}
