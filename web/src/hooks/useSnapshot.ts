/**
 * The document-shaped view of the live store.
 *
 * Screens and hooks still ask for a document by path ('game/state', 'companies/kraken',
 * 'news/n1', 'teams/saltwind'); the path is resolved against the snapshot the server pushes, so
 * no screen had to change when Firestore went away. A path outside the public/crew set resolves
 * to nothing — there is no way to read another crew's or a server-only document from here.
 */

import { useEffect, useRef } from 'react';
import { useLive } from './liveState';
import type { LiveSnapshot } from './normalizeLive';

/** Listener status shared by every hook result. */
export interface SnapshotStatus {
  /** True until the first snapshot (or error) for the current key. */
  loading: boolean;
  /** The stream is down: what is shown may be behind the server ("Reconnecting…", MOBILE §7.16). */
  fromCache: boolean;
  /** Error code/message of the live connection, else null. */
  error: string | null;
}

export interface DocOptions<T> {
  /** Kept for call-site compatibility: staleness is always reported now. */
  includeMetadataChanges?: boolean;
  /** Called for every change, outside render (for side effects such as the clock-skew estimate). */
  onSnapshotData?: (data: T | null, fromCache: boolean) => void;
}

const byId = <T extends { id?: string }>(items: readonly T[], id: string): T | null =>
  items.find((item) => item.id === id) ?? null;

/**
 * Resolves a document path against the live snapshot. `known` is false for a path the stream does
 * not carry, so the caller reports an empty, finished result rather than an endless skeleton.
 */
export function selectPath<T>(live: LiveSnapshot, path: string): { data: T | null; known: boolean } {
  const segments = path.split('/');
  const found = (data: unknown) => ({ data: (data ?? null) as T | null, known: true });
  if (path === 'game/state') return found(live.game);
  if (path === 'market/summary') return found(live.market);
  if (path === 'leaderboard/current') return found(live.leaderboard);
  if (segments.length === 2 && segments[0] === 'companies') return found(byId(live.companies, segments[1]!));
  if (segments.length === 2 && segments[0] === 'news') return found(byId(live.news, segments[1]!));
  if (segments.length === 2 && segments[0] === 'teams') {
    // Only the signed-in crew's own row is on the stream; another crew's is not readable.
    const team = live.portfolio.team;
    return found(team && team.id === segments[1] ? team : null);
  }
  return { data: null, known: false };
}

/** The document at `path` as the live store holds it; null path → nothing to read. */
export function useDocSnapshot<T>(path: string | null, options: DocOptions<T> = {}): SnapshotStatus & { data: T | null } {
  const live = useLive();
  const onData = useRef(options.onSnapshotData);
  useEffect(() => {
    onData.current = options.onSnapshotData;
  });

  const resolved = path === null ? null : selectPath<T>(live, path);
  const data = resolved?.data ?? null;

  useEffect(() => {
    if (path !== null) onData.current?.(data, live.stale);
  }, [path, data, live.stale]);

  if (path === null) return { data: null, loading: false, fromCache: false, error: null };
  if (!resolved!.known) return { data: null, loading: false, fromCache: live.stale, error: live.error };
  return { data, loading: !live.ready, fromCache: live.stale, error: live.error };
}

/** The live status on its own, for hooks that read a list rather than a document. */
export function liveStatus(live: LiveSnapshot): SnapshotStatus {
  return { loading: !live.ready, fromCache: live.stale, error: live.error };
}
