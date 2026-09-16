/**
 * The signed-in crew's order records: filled and rejected orders with their reasons, newest
 * first, at most `limit` (default 100). Activity rows and Order detail read these. They arrive on
 * the stream inside the crew's own `portfolio` payload. The host (no teamId) gets an empty,
 * non-loading result; while the session is still being restored the result is loading.
 */

import { useMemo } from 'react';
import type { OrderRecord } from '@deca/shared';
import { useAuth } from '../lib/auth';
import { feedLimit, newestFirst } from './crewFeed';
import { useLive } from './liveState';
import { type SnapshotStatus } from './useSnapshot';

export interface UseOrdersResult extends SnapshotStatus {
  orders: OrderRecord[];
}

const NO_ORDERS: OrderRecord[] = [];

export function useOrders(limit?: number): UseOrdersResult {
  const { teamId, loading: authLoading } = useAuth();
  const live = useLive();
  const max = feedLimit(limit);
  const orders = useMemo(
    () => newestFirst(live.portfolio.orders, 'createdAt', max),
    [live.portfolio, max],
  );
  if (!teamId) return { orders: NO_ORDERS, loading: Boolean(authLoading), fromCache: false, error: null };
  return { orders, loading: !live.ready, fromCache: live.stale, error: live.error };
}
