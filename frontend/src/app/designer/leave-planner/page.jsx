'use client';
import { Suspense } from 'react';
import LeavePlannerClient from '../[designerId]/leave-planner/LeavePlannerClient';

export default function LeavePlannerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading leave planner…</div>}>
      <LeavePlannerClient />
    </Suspense>
  );
}
