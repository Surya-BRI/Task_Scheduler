import { Suspense } from 'react';
import LoginPage from '@/views/LoginPage';

export default function LoginRoutePage() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
