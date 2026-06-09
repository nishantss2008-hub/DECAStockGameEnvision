/**
 * Realtime subscription to the leaderboard snapshot (`leaderboard/current`).
 *
 * Returns the current Leaderboard (or null while loading / if the doc is
 * absent) plus a loading flag that flips to false after the first snapshot
 * resolves.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Leaderboard } from '@deca/shared';
import { db } from '../firebase';

export interface UseLeaderboardResult {
  leaderboard: Leaderboard | null;
  loading: boolean;
}

export function useLeaderboard(): UseLeaderboardResult {
  const [leaderboard, setLeaderboard] = useState<Leaderboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = doc(db, 'leaderboard', 'current');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setLeaderboard(snap.exists() ? (snap.data() as Leaderboard) : null);
        setLoading(false);
      },
      () => {
        setLeaderboard(null);
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  return { leaderboard, loading };
}
