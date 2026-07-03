import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./env', () => ({
  env: { apiBaseUrl: 'http://localhost:7000/api/v1' },
}));

vi.mock('./session', () => ({
  clearSession: vi.fn(),
}));

describe('api-client', () => {
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/dashboard', search: '', href: '' },
    });
  });

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.resetModules();
  });

  it('redirects to login on 401 for protected routes', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 401,
      ok: false,
      text: async () => 'Unauthorized',
    });

    const { apiClient } = await import('./api-client');

    await expect(apiClient.get('/tasks')).rejects.toThrow('Unauthorized');
    expect(window.location.href).toContain('/login');
    expect(window.location.href).toContain('expired=1');
  });

  it('does not redirect on failed login attempt', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 401,
      ok: false,
      text: async () => 'Unauthorized',
    });

    const { apiClient } = await import('./api-client');

    await expect(
      apiClient.post('/auth/login', { email: 'a@b.com', password: 'wrong' }),
    ).rejects.toThrow('Invalid email or password.');
    expect(window.location.href).toBe('');
  });

  it('parses JSON responses', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ ok: true }),
    });

    const { apiClient } = await import('./api-client');
    await expect(apiClient.get('/health')).resolves.toEqual({ ok: true });
  });
});
