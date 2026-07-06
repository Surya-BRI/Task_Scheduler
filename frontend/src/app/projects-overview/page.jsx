'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getHomeRoute } from '@/lib/mock-auth';
import { ProjectsOverviewScreen } from '@/features/projects/components/ProjectsOverviewScreen';

const OVERVIEW_ROLES = new Set(['HOD']);

export default function ProjectsOverviewPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace('/login');
      return;
    }
    if (!OVERVIEW_ROLES.has(session.role)) {
      if (session.role === 'SALESPERSON') {
        router.replace('/sales/projects-overview');
        return;
      }
      router.replace(getHomeRoute(session));
      return;
    }
    setAuthorized(true);
  }, [router]);

  if (!authorized) return null;

  return <ProjectsOverviewScreen />;
}
