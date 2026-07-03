export type CircuitBreakerOptions = {
  failureThreshold?: number;
  resetTimeoutMs?: number;
};

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Lightweight in-memory circuit breaker for external dependencies.
 * Opens after consecutive failures; half-opens after reset timeout.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failureCount = 0;
  private openedAt = 0;

  constructor(
    private readonly name: string,
    private readonly options: CircuitBreakerOptions = {},
  ) {}

  getState(): CircuitBreakerState {
    if (this.state !== 'open') return this.state;
    const resetTimeoutMs = this.options.resetTimeoutMs ?? 30_000;
    if (Date.now() - this.openedAt >= resetTimeoutMs) {
      this.state = 'half-open';
    }
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const state = this.getState();
    if (state === 'open') {
      throw new Error(`Circuit breaker "${this.name}" is open`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    const threshold = this.options.failureThreshold ?? 5;
    this.failureCount += 1;
    if (this.failureCount >= threshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
  const existing = breakers.get(name);
  if (existing) return existing;
  const breaker = new CircuitBreaker(name, options);
  breakers.set(name, breaker);
  return breaker;
}

/** Test helper — clears the global breaker registry. */
export function resetCircuitBreakers(): void {
  breakers.clear();
}
