/**
 * Fired dispatches from the public `news` collection, newest first, at most `limit`
 * (default 100). Scheduled, unfired news lives on the server and is never readable here.
 */

import { useMemo } from 'react';
import { collection, limit as limitTo, orderBy, query } from 'firebase/firestore';
import type { NewsEvent } from '@deca/shared';
import { db } from '../firebase';
import { feedLimit } from './crewFeed';
import { useQuerySnapshot, type QuerySpec, type SnapshotStatus } from './useSnapshot';

export interface UseNewsResult extends SnapshotStatus {
  news: NewsEvent[];
}

export function useNews(limit?: number): UseNewsResult {
  const max = feedLimit(limit);
  const spec = useMemo<QuerySpec<NewsEvent>>(
    () => ({
      key: `news?orderBy=firedAt:desc&limit=${max}`,
      build: () => query(collection(db, 'news'), orderBy('firedAt', 'desc'), limitTo(max)),
      map: (id, data) => ({ ...(data as NewsEvent), id: (data as Partial<NewsEvent>).id ?? id }),
    }),
    [max],
  );
  const { items: news, loading, fromCache, error } = useQuerySnapshot(spec);
  return { news, loading, fromCache, error };
}
