/**
 * Read-through cache for the REST reads the stream does not carry: ranged history for the charts
 * and the fundamentals table.
 *
 * Two screens asking for the same range share one request (in-flight de-duplication), an answer
 * already held is returned without a second call, and a failure is dropped so the next mount
 * retries. Ranges move as the game ticks, so the map is bounded and evicts oldest-first.
 */

import { useEffect, useRef, useState } from 'react';

/** Most cached reads kept at once (a moving chart range mints a new key every tick). */
export const REST_CACHE_LIMIT = 120;

export interface RestEntry<T> {
  key: string;
  promise: Promise<T>;
  /** Set once the read has answered. */
  value?: T;
  /** Set once the read has failed. */
  error?: string;
}

const entries = new Map<string, RestEntry<unknown>>();

export const messageOf = (err: unknown): string =>
  err instanceof Error && err.message ? err.message : typeof err === 'string' && err ? err : 'Request failed';

/** Drops cached reads whose key starts with `prefix` (everything when it is omitted). */
export function invalidateRest(prefix?: string): void {
  if (prefix === undefined) {
    entries.clear();
    return;
  }
  for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
}

export function restCacheSize(): number {
  return entries.size;
}

/** The cached (or newly started) read for `key`. */
export function restEntry<T>(key: string, load: () => Promise<T>): RestEntry<T> {
  const held = entries.get(key) as RestEntry<T> | undefined;
  if (held) return held;
  let started: Promise<T>;
  try {
    started = Promise.resolve(load());
  } catch (err) {
    started = Promise.reject(err);
  }
  const entry: RestEntry<T> = { key, promise: started };
  entry.promise.then(
    (value) => {
      entry.value = value;
    },
    (err: unknown) => {
      entry.error = messageOf(err);
      // A failed read is not an answer: let the next caller try again.
      if (entries.get(key) === entry) entries.delete(key);
    },
  );
  entries.set(key, entry as RestEntry<unknown>);
  while (entries.size > REST_CACHE_LIMIT) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    entries.delete(oldest.value);
  }
  return entry;
}

export interface RestResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface RestState<T> {
  key: string;
  data: T | null;
  error: string | null;
}

/**
 * The cached read for `key`, loaded on mount and whenever the key changes. While a new key loads,
 * the previous answer stays on screen (a chart must not blank every tick); `loading` says so.
 * A null key means "nothing to read": no request, no loading.
 */
export function useRest<T>(key: string | null, load: () => Promise<T>): RestResult<T> {
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const [state, setState] = useState<RestState<T> | null>(() => {
    if (key === null) return null;
    const ready = (entries.get(key) as RestEntry<T> | undefined)?.value;
    return ready === undefined ? null : { key, data: ready, error: null };
  });

  useEffect(() => {
    if (key === null) return undefined;
    let active = true;
    const entry = restEntry<T>(key, () => loader.current());
    if (entry.value !== undefined) {
      setState((prev) => (prev?.key === key && prev.data === entry.value ? prev : { key, data: entry.value!, error: null }));
      return undefined;
    }
    entry.promise.then(
      (data) => {
        if (active) setState({ key, data, error: null });
      },
      (err: unknown) => {
        if (active) setState({ key, data: null, error: messageOf(err) });
      },
    );
    return () => {
      active = false;
    };
  }, [key]);

  if (key === null) return { data: null, loading: false, error: null };
  if (state?.key === key) return { data: state.data, loading: false, error: state.error };
  const cached = (entries.get(key) as RestEntry<T> | undefined)?.value;
  if (cached !== undefined) return { data: cached, loading: false, error: null };
  // Different key: keep the last answer visible while the new range loads.
  return { data: state?.data ?? null, loading: true, error: null };
}
