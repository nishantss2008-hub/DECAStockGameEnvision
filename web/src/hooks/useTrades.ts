/**
 * Realtime subscription to the current team's trade blotter.
 *
 * Streams the `trades` collection filtered to the authenticated team
 * (teamId == current teamId), ordered newest-first by executedAt and capped at
 * the 100 most recent fills. For an admin (or any signed-in user with no
 * teamId) this returns an empty list and is never loading. Re-subscribes when
 * the authenticated teamId changes.
 */

import { useEffect, useState } from 'react';
import {
  collection,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import type { Trade } from '@deca/shared';
import { db } from '../firebase';
import { useAuth } from '../lib/auth';

export interface UseTradesResult {
  trades: Trade[];
  loading: boolean;
}

export function useTrades(): UseTradesResult {
  const { teamId } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTrades([]);

    if (!teamId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'trades'),
      where('teamId', '==', teamId),
      orderBy('executedAt', 'desc'),
      fsLimit(100),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setTrades(snap.docs.map((d) => d.data() as Trade));
        setLoading(false);
      },
      () => {
        setTrades([]);
        setLoading(false);
      },
    );

    return unsub;
  }, [teamId]);

  return { trades, loading };
}
