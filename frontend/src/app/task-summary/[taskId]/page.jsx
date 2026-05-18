"use client";

import { Suspense } from "react";
import { TaskDetailsPage } from "@/views/TaskDetailsPage";

function Fallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-600">
      Loading…
    </div>
  );
}

export default function TaskSummaryRoutePage() {
  return (
    <Suspense fallback={<Fallback />}>
      <TaskDetailsPage />
    </Suspense>
  );
}
