import { isTransientError, withRetry } from './retry.util';

describe('retry.util', () => {
  it('identifies transient timeout errors', () => {
    expect(isTransientError(new Error('Timed out fetching a new connection from the pool'))).toBe(true);
    expect(isTransientError(new Error('Invalid credentials'))).toBe(false);
  });

  it('retries transient failures then succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('connection pool timeout');
        }
        return 'ok';
      },
      { maxAttempts: 3, baseDelayMs: 1 },
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry non-transient failures', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts += 1;
          throw new Error('validation failed');
        },
        { maxAttempts: 3, baseDelayMs: 1 },
      ),
    ).rejects.toThrow('validation failed');
    expect(attempts).toBe(1);
  });
});
