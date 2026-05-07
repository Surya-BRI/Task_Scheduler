import { LoginForm } from '@/features/auth/components/login-form';

export const metadata = {
  title: 'Sign In — Blue Rhine Industries',
  description: 'Sign in to the Task Scheduler',
};

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      {/* Card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 overflow-hidden">
        {/* Header band */}
        <div className="bg-[#1a3c6e] px-8 py-7">
          <div className="flex items-center gap-3 mb-4">
            <img src="/blue-rhine-logo.png" alt="Blue Rhine Industries" className="h-10 w-auto object-contain brightness-0 invert" />
          </div>
          <h1 className="text-white text-xl font-bold leading-tight">Welcome back</h1>
          <p className="text-blue-200 text-sm mt-1">Sign in to Task Scheduler</p>
        </div>

        {/* Form area */}
        <div className="px-8 py-7">
          <LoginForm />
        </div>
      </div>

      <p className="text-center text-xs text-slate-400 mt-5">
        © 2026 Blue Rhine Industries. All rights reserved.
      </p>
    </div>
  );
}
