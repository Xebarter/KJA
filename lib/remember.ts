type Entry = { until: number; value: unknown };

const store = new Map<string, Entry>();
const pending = new Map<string, Promise<unknown>>();

/** Keep a short-lived result in memory so the next page click doesn't repeat the same queries. */
export function remember<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.until > Date.now()) return Promise.resolve(hit.value as T);
  const inflight = pending.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;
  const promise = load().then(
    (value) => {
      store.set(key, { until: Date.now() + ttlMs, value });
      pending.delete(key);
      return value;
    },
    (error) => {
      pending.delete(key);
      throw error;
    },
  );
  pending.set(key, promise);
  return promise;
}

export function forget(key: string) {
  store.delete(key);
}

export function forgetPrefix(prefix: string) {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
