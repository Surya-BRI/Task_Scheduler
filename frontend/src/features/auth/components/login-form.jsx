'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { getHomeRoute } from '@/lib/mock-auth';
import { loginApi } from '@/features/auth/services/auth.api';
import { setAccessToken } from '@/lib/auth-token';


const DEMO_ACCOUNTS = [
  { label: 'HOD — Sarah Mitchell', email: 'sarah.mitchell@bluerhine.com', password: 'hod123', badge: 'HOD', color: 'bg-violet-100 text-violet-700 border-violet-200' },
  { label: 'Designer — Alex Johnson', email: 'alex.johnson@bluerhine.com', password: 'alex123', badge: 'Designer', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { label: 'Designer — Alexander Allen', email: 'alexander.allen@bluerhine.com', password: 'alex123', badge: 'Designer', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  { label: 'Designer — Benjamin Harris', email: 'benjamin.harris@bluerhine.com', password: 'ben123', badge: 'Designer', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      const response = await loginApi(email, password);
      // Persist JWT for API calls
      setAccessToken(response.accessToken);
      // Persist session profile to localStorage so mock-auth helpers still work
      const session = {
        id: response.user.id,
        email: response.user.email,
        name: response.user.fullName,
        role: response.user.role, // 'HOD' or 'DESIGNER'
        initials: response.user.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('br_session', JSON.stringify(session));
      }
      router.push(getHomeRoute(session));
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Email */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-slate-700" htmlFor="email">Email address</label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@bluerhine.com"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label className="text-sm font-semibold text-slate-700" htmlFor="password">Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            id="password"
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

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-lg bg-[#1a3c6e] hover:bg-[#152f57] text-white font-semibold text-sm transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Signing in...
          </>
        ) : 'Sign In'}
      </button>

      {/* Demo Accounts */}
      <div className="pt-3 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Quick Demo Logins</p>
        <div className="grid grid-cols-1 gap-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => fillDemo(account)}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:bg-slate-50 hover:border-slate-300 transition-colors group"
            >
              <span className="font-medium text-slate-700 group-hover:text-slate-900 truncate">{account.label}</span>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${account.color}`}>
                {account.badge}
              </span>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
