/**
 * The signed-in crew's fills (`trades` where teamId is the crew), newest first, at most `limit`
 * (default 100). The host (no teamId) gets an empty, non-loading result;
 * while the session is still being restored the result is loading.
 */

import { useMemo } from 'react';
import type { Trade } from '@deca/shared';
import { useAuth } from '../lib/auth';
import { crewFeedSpec, feedLimit } from './crewFeed';
import { useQuerySnapshot, type SnapshotStatus } from './useSnapshot';

export interface UseTradesResult extends SnapshotStatus {
  trades: Trade[];
}

export function useTrades(limit?: number): UseTradesResult {
  const { teamId, loading: authLoading } = useAuth();
  const max = feedLimit(limit);
  const spec = useMemo(() => (teamId ? crewFeedSpec<Trade>('trades', teamId, 'executedAt', max) : null), [teamId, max]);
  const { items: trades, loading, fromCache, error } = useQuerySnapshot(spec);
  return { trades, loading: Boolean(authLoading) || loading, fromCache, error };
}
