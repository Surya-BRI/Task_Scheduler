'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ensureSession, getHomeRoute } from '@/lib/mock-auth';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    ensureSession().then((session) => {
      if (!active) return;
      // expired=1 so middleware lets /login render instead of bouncing back here (cookie is valid-shaped but rejected).
      router.replace(session ? getHomeRoute(session) : '/login?expired=1');
    });
    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
