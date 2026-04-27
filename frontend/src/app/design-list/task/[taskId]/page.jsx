'use client';
import { Suspense } from 'react';
import { TaskDetailsPage } from '@/views/TaskDetailsPage';
function TaskDetailsFallback() {
    return (<div className="flex min-h-[50vh] items-center justify-center bg-slate-50 text-sm text-slate-600">
      Loading task…
    </div>);
}
export default function TaskDetailsRoutePage() {
    return (<Suspense fallback={<TaskDetailsFallback />}>
      <TaskDetailsPage />
    </Suspense>);
}
