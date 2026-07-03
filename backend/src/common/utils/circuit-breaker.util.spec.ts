import { CircuitBreaker, getCircuitBreaker, resetCircuitBreakers } from './circuit-breaker.util';

describe('circuit-breaker.util', () => {
  afterEach(() => {
    resetCircuitBreakers();
  });

  it('opens after consecutive failures', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 2, resetTimeoutMs: 60_000 });

    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    await expect(breaker.execute(async () => 'ok')).rejects.toThrow(/Circuit breaker "test" is open/);
  });

  it('resets after successful execution in half-open state', async () => {
    const breaker = new CircuitBreaker('half-open', { failureThreshold: 1, resetTimeoutMs: 1 });
    await expect(breaker.execute(async () => { throw new Error('fail'); })).rejects.toThrow('fail');

    await new Promise((resolve) => setTimeout(resolve, 5));
    await expect(breaker.execute(async () => 'recovered')).resolves.toBe('recovered');
    expect(breaker.getState()).toBe('closed');
  });

  it('reuses named breakers from registry', () => {
    const a = getCircuitBreaker('shared');
    const b = getCircuitBreaker('shared');
    expect(a).toBe(b);
  });
});
