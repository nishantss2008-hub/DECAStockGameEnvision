/**
 * Last Firestore snapshot per listener key, kept in memory for this page load.
 *
 * Hooks seed their first render from it, so pushing a screen that reads data another screen
 * already has (Markets → Company, switching chart ranges) shows the numbers at once instead of
 * a skeleton frame while the new listener attaches. The live listener still runs and replaces
 * the value. Cleared on sign-out so one crew's data never outlives its session on a shared
 * device.
 */

export interface CachedSnapshot {
  /** Document data, mapped query items, or null for a document that does not exist. */
  data: unknown;
  /** Firestore `metadata.fromCache` of the snapshot that produced `data`. */
  fromCache: boolean;
}

/** Enough for every company doc, the visible history chunks of a few charts and the lists. */
export const SNAPSHOT_CACHE_LIMIT = 400;

const cache = new Map<string, CachedSnapshot>();

export function readSnapshot(key: string): CachedSnapshot | undefined {
  return cache.get(key);
}

/** Stores a snapshot as the newest entry, evicting the oldest-written key beyond the limit. */
export function writeSnapshot(key: string, entry: CachedSnapshot): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > SNAPSHOT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function clearSnapshotCache(): void {
  cache.clear();
}

export function snapshotCacheSize(): number {
  return cache.size;
}
