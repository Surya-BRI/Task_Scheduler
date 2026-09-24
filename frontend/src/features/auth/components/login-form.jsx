'use client';

import { useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { env } from '@/lib/env';

export function LoginForm() {
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  return (
    <div className="space-y-5 text-center">
      <p className="text-sm text-slate-600">
        Sign in through the BRI ERP portal — you&apos;ll be brought back here automatically once
        you&apos;re signed in there.
      </p>

      {sessionExpired && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800 text-left">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Your session expired. Please sign in again.
        </div>
      )}

      <a
        href={env.erpLoginUrl}
        className="inline-flex w-full items-center justify-center py-2.5 px-4 rounded-lg bg-[#1a3c6e] hover:bg-[#152f57] text-white font-semibold text-sm transition-colors shadow-sm"
      >
        Go to ERP Sign In
      </a>
    </div>
  );
}
