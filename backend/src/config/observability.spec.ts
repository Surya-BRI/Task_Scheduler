import { getOtelSdk, initObservability, shutdownObservability } from './observability';

describe('observability', () => {
  it('initObservability is a no-op without Sentry or OTLP env vars', async () => {
    await expect(initObservability({})).resolves.toBeUndefined();
    expect(getOtelSdk()).toBeNull();
  });

  it('shutdownObservability resolves when observability is disabled', async () => {
    await expect(shutdownObservability()).resolves.toBeUndefined();
  });
});
