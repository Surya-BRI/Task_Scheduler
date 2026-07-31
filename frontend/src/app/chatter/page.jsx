"use client";

import { Suspense } from "react";
import { SessionBootstrapSkeleton } from "@/components/SessionBootstrapSkeleton";
import { ChatterScreen } from "@/features/chatter/components/ChatterScreen";

export default function ChatterPage() {
  return (
    <Suspense fallback={<SessionBootstrapSkeleton label="Loading chatter" />}>
      <ChatterScreen />
    </Suspense>
  );
}
