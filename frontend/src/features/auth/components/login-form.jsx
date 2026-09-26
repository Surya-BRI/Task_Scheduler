'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { env } from '@/lib/env';
import { getHomeRoute } from '@/lib/mock-auth';
import { fetchSession } from '@/lib/session-api';
import { loginApi } from '@/features/auth/services/auth.api';
import { toUserFacingError } from '@/lib/api-error';

/** Local development only — gated by NEXT_PUBLIC_ENABLE_DEV_LOGIN (never active in production builds). */
function DevLoginForm({ sessionExpired }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setLoading(true);
    try {
      await loginApi(username, password);
      const session = await fetchSession();
      router.push(getHomeRoute(session));
    } catch (err) {
      setError(toUserFacingError(err, 'Login failed. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        Local development sign-in (ERP username + password)
      </p>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-slate-700" htmlFor="dev-username">ERP Username</label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            id="dev-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. Chithira-UAT"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-slate-700" htmlFor="dev-password">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            id="dev-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full pl-9 pr-10 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {sessionExpired && !error && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-sm text-amber-800">
          Your session expired. Please sign in again.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-lg bg-[#1a3c6e] hover:bg-[#152f57] text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get('expired') === '1';

  if (env.enableDevLogin) {
    return <DevLoginForm sessionExpired={sessionExpired} />;
  }

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
