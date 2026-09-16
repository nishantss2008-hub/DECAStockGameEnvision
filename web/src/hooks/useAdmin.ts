/**
 * Host console data.
 *
 * Crews are never given a route to another crew's rows, so everything here is a host-only
 * `GET /admin/*` read on an interval rather than anything on the stream: crews get an empty,
 * non-loading result and send no request at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Holding, Team, Trade } from '@deca/shared';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';
import { type SnapshotStatus } from './useSnapshot';

export interface UseAdminPollResult<T> {
  data: T | null;
  /** Message of the latest failed request; cleared by the next success. Last good data is kept. */
  error: string | null;
  /** Fetches now (for example after a host action) without waiting for the next interval. */
  refresh(): void;
}

/** Shortest poll interval, so a bad argument cannot flood the authority service. */
export const MIN_POLL_MS = 1_000;
/** How often the host console refreshes its lists. */
export const ADMIN_POLL_MS = 4_000;

/** Polls `path` on an interval; a null path sends nothing. */
function usePoll<T>(path: string | null, intervalMs: number): UseAdminPollResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchNow = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;
    let latest = 0;
    let inFlight = false;
    setData(null);
    setError(null);
    if (path === null) {
      fetchNow.current = () => {};
      return undefined;
    }
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

/** Polls a host API GET route (`/api/admin/market`, `/api/admin/news/scheduled`, `/api/admin/logs`). */
export function useAdminPoll<T>(path: string, intervalMs: number): UseAdminPollResult<T> {
  return usePoll<T>(path, intervalMs);
}

const EMPTY_TEAMS: Team[] = [];
const EMPTY_TRADES: Trade[] = [];
const EMPTY_HOLDINGS: Holding[] = [];

/** Host-only list status: loading until the first answer, empty and finished for a crew. */
function status(path: string | null, data: unknown, error: string | null, authLoading?: boolean): SnapshotStatus {
  if (authLoading) return { loading: true, fromCache: false, error: null };
  if (path === null) return { loading: false, fromCache: false, error: null };
  return { loading: data === null && error === null, fromCache: false, error };
}

export interface UseAdminTeamsResult extends SnapshotStatus {
  teams: Team[];
}

const byName = (a: Team, b: Team) => (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

export const ADMIN_TEAMS_PATH = '/api/admin/teams';

/** Every crew, by name (host rule); crews get an empty result and send no request. */
export function useAdminTeams(): UseAdminTeamsResult {
  const { role, loading: authLoading } = useAuth();
  const path = role === 'admin' ? ADMIN_TEAMS_PATH : null;
  const { data, error } = usePoll<{ teams?: Team[] }>(path, ADMIN_POLL_MS);
  const teams = data?.teams ? [...data.teams].sort(byName) : EMPTY_TEAMS;
  return { teams, ...status(path, data, error, authLoading) };
}

/** Rows on the host trade tape (MOBILE §7.18). */
export const ADMIN_TAPE_LIMIT = 100;

export interface UseAdminTapeResult extends SnapshotStatus {
  trades: Trade[];
}

/** Every crew's fills, newest first (host rule); crews get an empty result and send no request. */
export function useAdminTape(max = ADMIN_TAPE_LIMIT): UseAdminTapeResult {
  const { role, loading: authLoading } = useAuth();
  const path = role === 'admin' ? `/api/admin/trades?limit=${max}` : null;
  const { data, error } = usePoll<{ trades?: Trade[] }>(path, ADMIN_POLL_MS);
  return { trades: data?.trades ?? EMPTY_TRADES, ...status(path, data, error, authLoading) };
}

export interface UseAdminHoldingsResult extends SnapshotStatus {
  holdings: Holding[];
}

/** One crew's non-empty holdings, host only. */
export function useAdminHoldings(teamId: string | null): UseAdminHoldingsResult {
  const { role } = useAuth();
  const path = role === 'admin' && teamId ? `/api/admin/teams/${encodeURIComponent(teamId)}/holdings` : null;
  const { data, error } = usePoll<{ holdings?: Holding[] }>(path, ADMIN_POLL_MS);
  const holdings = data?.holdings ? data.holdings.filter((h) => h.shares !== 0) : EMPTY_HOLDINGS;
  return { holdings, ...status(path, data, error) };
}
