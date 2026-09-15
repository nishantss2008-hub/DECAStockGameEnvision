/**
 * The signed-in crew's order records (`orders` where teamId is the crew): filled and rejected
 * orders with their reasons, newest first, at most `limit` (default 100). Activity rows and
 * Order detail read these. The host (no teamId) gets an empty, non-loading result;
 * while the session is still being restored the result is loading.
 */

import { useMemo } from 'react';
import type { OrderRecord } from '@deca/shared';
import { useAuth } from '../lib/auth';
import { crewFeedSpec, feedLimit } from './crewFeed';
import { useQuerySnapshot, type SnapshotStatus } from './useSnapshot';

export interface UseOrdersResult extends SnapshotStatus {
  orders: OrderRecord[];
}

export function useOrders(limit?: number): UseOrdersResult {
  const { teamId, loading: authLoading } = useAuth();
  const max = feedLimit(limit);
  const spec = useMemo(() => (teamId ? crewFeedSpec<OrderRecord>('orders', teamId, 'createdAt', max) : null), [teamId, max]);
  const { items: orders, loading, fromCache, error } = useQuerySnapshot(spec);
  return { orders, loading: Boolean(authLoading) || loading, fromCache, error };
}
