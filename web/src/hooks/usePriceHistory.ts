/**
 * Realtime subscription to a company's recorded price ticks
 * (`companies/{id}/priceHistory`).
 *
 * Points are returned ordered by tick ascending (oldest -> newest), ready to
 * feed straight into a chart. When `maxPoints` is provided, only the most
 * recent N ticks are kept (the query fetches the newest N then re-sorts
 * ascending for display). Re-subscribes when `id` or `maxPoints` changes.
 */

import { useEffect, useState } from 'react';
import {
  collection,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import type { PricePoint } from '@deca/shared';
import { db } from '../firebase';

export interface UsePriceHistoryResult {
  history: PricePoint[];
  loading: boolean;
}

export function usePriceHistory(
  id: string | null | undefined,
  maxPoints?: number,
): UsePriceHistoryResult {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHistory([]);

    if (!id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const base = collection(db, 'companies', id, 'priceHistory');
    // When limiting, grab the newest N (tick desc) then flip to ascending for
    // display; otherwise just stream everything in ascending tick order.
    const q =
      maxPoints && maxPoints > 0
        ? query(base, orderBy('tick', 'desc'), fsLimit(maxPoints))
        : query(base, orderBy('tick', 'asc'));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const points = snap.docs.map((d) => d.data() as PricePoint);
        if (maxPoints && maxPoints > 0) {
          points.sort((a, b) => a.tick - b.tick);
        }
        setHistory(points);
        setLoading(false);
      },
      () => {
        setHistory([]);
        setLoading(false);
      },
    );

    return unsub;
  }, [id, maxPoints]);

  return { history, loading };
}
