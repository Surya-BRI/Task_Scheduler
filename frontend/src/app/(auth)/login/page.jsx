import { LoginForm } from '@/features/auth/components/login-form';

export default function LoginPage() {
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Task Scheduler</h1>
      <p className="mt-2 text-sm text-slate-500">Sign in to continue</p>
      <div className="mt-6">
        <LoginForm />
      </div>
    </div>
  );
}
