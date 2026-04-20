'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginSchema } from '../schemas/login.schema';
import { login } from '../services/auth.api';
import { setAccessToken } from '@/lib/auth-token';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const form = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      setError('');
      const response = await login(values.email, values.password);
      setAccessToken(response.accessToken);
      router.push('/dashboard');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Login failed. Please check your credentials.';
      setError(message);
    }
  });

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="email">
          Email
        </label>
        <Input id="email" type="email" {...form.register('email')} />
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="password">
          Password
        </label>
        <Input id="password" type="password" {...form.register('password')} />
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <Button type="submit" className="w-full">
        Sign In
      </Button>
    </form>
  );
}
