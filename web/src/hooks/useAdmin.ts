/**
 * Host console data.
 *
 * - useAdminTeams: live `teams` listener, host only (crews get an empty, non-loading result and
 *   no listener, since rules would deny it).
 * - useAdminPoll: polls an authority API GET route (`/admin/market`, `/admin/news/scheduled`,
 *   `/admin/logs`) on an interval. Server-only data such as quality scores reaches the host this
 *   way, never through Firestore listeners.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, query } from 'firebase/firestore';
import type { Team } from '@deca/shared';
import { db } from '../firebase';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useQuerySnapshot, type QuerySpec, type SnapshotStatus } from './useSnapshot';

export interface UseAdminTeamsResult extends SnapshotStatus {
  teams: Team[];
}

const byName = (a: Team, b: Team) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

const TEAMS: QuerySpec<Team> = {
  key: 'teams',
  build: () => query(collection(db, 'teams')),
  map: (id, data) => ({ ...(data as Team), id: (data as Partial<Team>).id ?? id }),
  select: (items) => [...items].sort(byName),
};

export function useAdminTeams(): UseAdminTeamsResult {
  const { role, loading: authLoading } = useAuth();
  const { items: teams, loading, fromCache, error } = useQuerySnapshot(role === 'admin' ? TEAMS : null);
  return { teams, loading: Boolean(authLoading) || loading, fromCache, error };
}

export interface UseAdminPollResult<T> {
  data: T | null;
  /** Message of the latest failed request; cleared by the next success. Last good data is kept. */
  error: string | null;
  /** Fetches now (for example after a host action) without waiting for the next interval. */
  refresh(): void;
}

/** Shortest poll interval, so a bad argument cannot flood the authority service. */
export const MIN_POLL_MS = 1_000;

export function useAdminPoll<T>(path: string, intervalMs: number): UseAdminPollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchNow = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let latest = 0;
    let inFlight = false;
    setData(null);
    setError(null);
    // Interval polls skip while a request is still out, so a slow server is never flooded and
    // its answer is never discarded. refresh() always sends, and only the newest answer is used.
    const run = (force: boolean) => {
      if (inFlight && !force) return;
      inFlight = true;
      const call = ++latest;
      apiGet<T>(path).then(
        (result) => {
          if (!active || call !== latest) return;
          inFlight = false;
          setData(result);
          setError(null);
        },
        (err: unknown) => {
          if (!active || call !== latest) return;
          inFlight = false;
          setError(err instanceof Error && err.message ? err.message : 'Request failed');
        },
      );
    };
    fetchNow.current = () => run(true);
    run(true);
    const every = Number.isFinite(intervalMs) ? Math.max(MIN_POLL_MS, intervalMs) : MIN_POLL_MS;
    const id = setInterval(() => run(false), every);
    return () => {
      active = false;
      clearInterval(id);
      fetchNow.current = () => {};
    };
  }, [path, intervalMs]);

  const refresh = useCallback(() => fetchNow.current(), []);
  return { data, error, refresh };
}
