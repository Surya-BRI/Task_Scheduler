"use client";

import { Suspense } from "react";
import { TaskViewPage } from "@/views/TaskViewPage";

function Fallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-slate-50 text-sm text-slate-600">
      Loading…
    </div>
  );
}

export default function ProjectTaskCreationRoutePage() {
  return (
    <Suspense fallback={<Fallback />}>
      <TaskViewPage />
    </Suspense>
  );
}
