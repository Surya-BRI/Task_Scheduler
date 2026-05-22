"use client";

import { Suspense } from "react";
import { TaskViewPage } from "@/views/TaskViewPage";

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
      <TaskViewPage />
    </Suspense>
  );
}
