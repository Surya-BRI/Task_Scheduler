'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LeavePlannerClient from '@/app/designer/[designerId]/leave-planner/LeavePlannerClient';
import { getSession } from '@/lib/mock-auth';
import { leavePlannerPath, isHodRole } from '@/lib/role-routes';
import { SessionBootstrapSkeleton } from '@/components/SessionBootstrapSkeleton';

function HodGate({ children }) {
  const router = useRouter();
  useEffect(() => {
    const session = getSession();
    if (!session) return;
    if (!isHodRole(session.role)) {
      router.replace(leavePlannerPath(session.role, window.location.search, window.location.hash));
    }
  }, [router]);
  return children;
}

export default function HodLeavePlannerPage() {
  return (
    <Suspense fallback={<SessionBootstrapSkeleton label="Loading leave planner…" />}>
      <HodGate>
        <LeavePlannerClient />
      </HodGate>
    </Suspense>
  );
}
