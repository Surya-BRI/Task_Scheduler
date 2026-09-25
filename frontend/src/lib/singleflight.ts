const inflight = new Map<string, Promise<unknown>>();

export function singleflight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = Promise.resolve()
    .then(run)
    .finally(() => {
      if (inflight.get(key) === promise) inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
