/**
 * Realtime subscription to the public `news` collection.
 *
 * Returns fired news events ordered newest-first (by firedAt desc), plus a
 * loading flag that flips to false after the first snapshot resolves.
 */

import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import type { NewsEvent } from '@deca/shared';
import { db } from '../firebase';

export interface UseNewsResult {
  news: NewsEvent[];
  loading: boolean;
}

export function useNews(): UseNewsResult {
  const [news, setNews] = useState<NewsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('firedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNews(snap.docs.map((d) => d.data() as NewsEvent));
        setLoading(false);
      },
      () => {
        setNews([]);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { news, loading };
}
