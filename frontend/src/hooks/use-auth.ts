'use client';

import { useMemo } from 'react';
import { getAccessToken } from '@/lib/auth-token';

export function useAuth() {
  const token = getAccessToken();
  return useMemo(
    () => ({
      isAuthenticated: !!token,
      token,
    }),
    [token],
  );
}
