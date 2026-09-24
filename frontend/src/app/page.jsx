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
      router.replace(session ? getHomeRoute(session) : '/login');
    });
    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
