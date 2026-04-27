'use client';
import { Suspense } from 'react';
import { DesignListRecordPage } from '@/views/DesignListRecordPage';
export default function DesignListRecordRoutePage() {
    return (<Suspense fallback={<div className="flex min-h-[40vh] items-center justify-center text-slate-600 text-sm">Loading…</div>}>
      <DesignListRecordPage />
    </Suspense>);
}
