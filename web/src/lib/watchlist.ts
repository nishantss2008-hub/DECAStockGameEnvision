/**
 * Per-crew watchlist kept in localStorage under `bx.watchlist.${teamId}`.
 *
 * All hook instances for the same crew share one in-memory store, so starring a company
 * on its page updates the Markets watchlist at once; other tabs sync through the
 * `storage` event. Storage failures (private mode, quota) fall back to memory.
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** Default ids; callers filter to companies that exist in the current market. */
export const DEFAULT_WATCHLIST: readonly string[] = ['kraken', 'port-royal', 'cursed-doubloon', 'astrolabe', 'galleon-goods'];

export function watchlistKey(teamId: string): string {
  return `bx.watchlist.${teamId}`;
}

/** Stored JSON → ids. Missing or corrupt → default; a stored empty list stays empty. */
export function parseWatchlist(raw: string | null): string[] {
  if (raw === null) return [...DEFAULT_WATCHLIST];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_WATCHLIST];
    return [...new Set(parsed.filter((x): x is string => typeof x === 'string' && x.length > 0))];
  } catch {
    return [...DEFAULT_WATCHLIST];
  }
}

/** Adds the id at the end, or removes it when present. Never mutates. */
export function toggleInList(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

type Listener = () => void;

interface Entry {
  value: string[];
  listeners: Set<Listener>;
}

const MEMORY_KEY = 'bx.watchlist.__signed-out__';
const store = new Map<string, Entry>();

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function entryFor(key: string): Entry {
  let entry = store.get(key);
  if (!entry) {
    entry = { value: parseWatchlist(key === MEMORY_KEY ? null : readStorage(key)), listeners: new Set() };
    store.set(key, entry);
  }
  return entry;
}

function setValue(key: string, value: string[]): void {
  const entry = entryFor(key);
  entry.value = value;
  if (key !== MEMORY_KEY) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable: keep the in-memory value for this session.
    }
  }
  for (const l of entry.listeners) l();
}

let storageListenerInstalled = false;
function installStorageListener(): void {
  if (storageListenerInstalled || typeof window === 'undefined') return;
  storageListenerInstalled = true;
  window.addEventListener('storage', (event) => {
    if (!event.key || !store.has(event.key)) return;
    const entry = store.get(event.key)!;
    entry.value = parseWatchlist(event.newValue);
    for (const l of entry.listeners) l();
  });
}

export interface Watchlist {
  symbols: string[];
  toggle(id: string): void;
  has(id: string): boolean;
}

export function useWatchlist(teamId: string | null): Watchlist {
  const key = teamId ? watchlistKey(teamId) : MEMORY_KEY;

  const subscribe = useCallback(
    (listener: Listener) => {
      installStorageListener();
      const entry = entryFor(key);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [key],
  );
  const symbols = useSyncExternalStore(
    subscribe,
    () => entryFor(key).value,
    () => entryFor(key).value,
  );

  const toggle = useCallback((id: string) => setValue(key, toggleInList(entryFor(key).value, id)), [key]);

  return useMemo(() => {
    const set = new Set(symbols);
    return { symbols, toggle, has: (id: string) => set.has(id) };
  }, [symbols, toggle]);
}
