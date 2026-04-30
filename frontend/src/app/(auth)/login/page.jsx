import { LoginForm } from '@/features/auth/components/login-form';

export default function LoginPage() {
  return (
    <div className="ui-surface w-full max-w-md p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Task Scheduler</h1>
      <p className="mt-2 text-sm text-slate-500">Sign in to continue</p>
      <div className="mt-6">
        <LoginForm />
      </div>
    </div>
  );
}
