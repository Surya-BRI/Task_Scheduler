"use client";

import { Suspense } from "react";
import { ChatterScreen } from "@/features/chatter/components/ChatterScreen";

function Fallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-600">
      Loading chatter…
    </div>
  );
}

export default function ChatterPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <ChatterScreen />
    </Suspense>
  );
}
