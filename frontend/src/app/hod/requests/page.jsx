'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import RequestsClient from '@/app/designer/[designerId]/requests/RequestsClient';
import { getSession } from '@/lib/mock-auth';
import { requestsPath, isHodRole } from '@/lib/role-routes';
import { SessionBootstrapSkeleton } from '@/components/SessionBootstrapSkeleton';

function HodGate({ children }) {
  const router = useRouter();
  useEffect(() => {
    const session = getSession();
    if (!session) return;
    if (!isHodRole(session.role)) {
      router.replace(requestsPath(session.role, window.location.search, window.location.hash));
    }
  }, [router]);
  return children;
}

export default function HodRequestsPage() {
  return (
    <Suspense fallback={<SessionBootstrapSkeleton label="Loading requests…" />}>
      <HodGate>
        <RequestsClient />
      </HodGate>
    </Suspense>
  );
}
