/**
 * The signed-in crew's fills, newest first, at most `limit` (default 100). They arrive on the
 * stream inside the crew's own `portfolio` payload. The host (no teamId) gets an empty,
 * non-loading result; while the session is still being restored the result is loading.
 */

import { useMemo } from 'react';
import type { Trade } from '@deca/shared';
import { useAuth } from '../lib/auth';
import { feedLimit, newestFirst } from './crewFeed';
import { useLive } from './liveState';
import { type SnapshotStatus } from './useSnapshot';

export interface UseTradesResult extends SnapshotStatus {
  trades: Trade[];
}

const NO_TRADES: Trade[] = [];

export function useTrades(limit?: number): UseTradesResult {
  const { teamId, loading: authLoading } = useAuth();
  const live = useLive();
  const max = feedLimit(limit);
  const trades = useMemo(
    () => newestFirst(live.portfolio.trades, 'executedAt', max),
    [live.portfolio, max],
  );
  if (!teamId) return { trades: NO_TRADES, loading: Boolean(authLoading), fromCache: false, error: null };
  return { trades, loading: !live.ready, fromCache: live.stale, error: live.error };
}
